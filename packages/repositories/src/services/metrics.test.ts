import type { AuditEvent, Patient } from "@laif/domain";
import { DISTRICT_IDS, FACILITY_IDS, PERSONA_IDS } from "@laif/mock-data";
import { describe, expect, it } from "vitest";

import { createHarness } from "../testing/harness.ts";

const exportInput = {
  reasonCode: "programme_review" as const,
  template: "programme-overview",
  granularity: "district" as const,
  scope: { districtIds: [DISTRICT_IDS.alpha], facilityIds: [] },
  filters: { from: "2026-09-01" },
  rowCount: 4,
  suppressedCells: 1,
  sha256: "a".repeat(64),
};

describe("aggregate metrics + exports", () => {
  it("programme lead gets programme-wide metrics computed on the demo clock", async () => {
    const h = await createHarness({ appId: "admin", personaId: PERSONA_IDS.leadProgramme });
    const metrics = await h.repo.getAggregateMetrics({ from: "2026-09-01", to: "2026-10-14" });
    expect(metrics).toMatchObject({
      metricVersion: "demo-metrics-1",
      computedAt: "2026-10-14T06:00:00.000Z",
      filter: { from: "2026-09-01", to: "2026-10-14", districtIds: null },
    });
    const beta = await h.repo.getAggregateMetrics({ districtIds: [DISTRICT_IDS.beta] });
    expect(beta.filter.districtIds).toEqual([DISTRICT_IDS.beta]);
  });

  it("facility manager: own facility only; their district aggregate is FORBIDDEN", async () => {
    const h = await createHarness({ appId: "admin", personaId: PERSONA_IDS.fmgrAlpha1 });
    const own = await h.repo.getAggregateMetrics();
    expect(own.filter.facilityIds).toEqual([FACILITY_IDS.alpha1]);
    await expect(
      h.repo.getAggregateMetrics({ districtIds: [DISTRICT_IDS.alpha] }),
    ).rejects.toMatchObject({
      code: "FORBIDDEN",
    });
    await expect(
      h.repo.getAggregateMetrics({ facilityIds: [FACILITY_IDS.alpha2] }),
    ).rejects.toMatchObject({
      code: "FORBIDDEN",
    });
    const c = await createHarness({ personaId: PERSONA_IDS.clinAlpha1 });
    await expect(c.repo.getAggregateMetrics()).rejects.toMatchObject({ reason: "ROLE" });
  });

  it("recordExport writes export.generated; out-of-scope exports are audited as export.denied", async () => {
    const h = await createHarness({ appId: "admin", personaId: PERSONA_IDS.analystAlpha });
    const key = h.key();
    const result = await h.repo.recordExport(exportInput, key);
    expect(result.data).toMatchObject({
      action: "export.generated",
      category: "export",
      actorId: PERSONA_IDS.analystAlpha,
      changeSummary: { template: "programme-overview", rowCount: 4, suppressedCells: 1 },
    });
    expect(result.auditEventId).toBe(result.data.id);
    const replay = await h.repo.recordExport(exportInput, key);
    expect(replay.replayed).toBe(true);
    await expect(
      h.repo.recordExport(
        { ...exportInput, scope: { districtIds: [DISTRICT_IDS.beta], facilityIds: [] } },
        h.key(),
      ),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(
      h.repo.recordExport(
        { ...exportInput, scope: { districtIds: [], facilityIds: [FACILITY_IDS.beta1] } },
        h.key(),
      ),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(
      h.repo.recordExport({ ...exportInput, template: "audit-log" }, h.key()),
    ).rejects.toMatchObject({
      reason: "ROLE",
    });
    await expect(
      h.repo.recordExport({ ...exportInput, reasonCode: "other" }, h.key()),
    ).rejects.toMatchObject({
      fieldErrors: { reasonText: { key: "required" } },
    });
    const denied = (await h.store.getAll<AuditEvent>("auditEvents")).filter(
      (e) => e.action === "export.denied",
    );
    expect(denied).toHaveLength(3);
    expect(denied.every((e) => e.outcome === "denied" && e.category === "export")).toBe(true);
  });
});

describe("ADM-05 workload source rows", () => {
  it("getMetricsRecords: tasks by createdAt (not cohort), staff directory with codes only", async () => {
    const h = await createHarness({ appId: "admin", personaId: PERSONA_IDS.fmgrAlpha1 });
    const { records } = await h.repo.getMetricsRecords({ from: "2026-07-17", to: "2026-10-14" });
    const tasks = records.taskFollowUps ?? [];
    expect(tasks.length).toBeGreaterThan(0);
    expect(tasks.every((f) => f.facilityId === FACILITY_IDS.alpha1)).toBe(true);
    const day = (iso: string) => new Date(Date.parse(iso) + 7_200_000).toISOString().slice(0, 10);
    expect(
      tasks.every(
        (f) =>
          (day(f.createdAt) >= "2026-07-17" && day(f.createdAt) <= "2026-10-14") ||
          f.attempts.some((a) => day(a.at) >= "2026-07-17" && day(a.at) <= "2026-10-14"),
      ),
    ).toBe(true);
    // Free text is redacted like every aggregate read.
    expect(tasks.every((f) => f.attempts.every((a) => a.note === ""))).toBe(true);
    const workers = records.workers ?? [];
    expect(workers.map((w) => w.workerCode)).toEqual(expect.arrayContaining(["HW-014", "HW-015"]));
    expect(workers.map((w) => w.workerCode)).not.toContain("HW-031");
    expect(workers.every((w) => w.facilityIds.every((id) => id === FACILITY_IDS.alpha1))).toBe(
      true,
    );
    for (const w of workers)
      expect(Object.keys(w).sort()).toEqual(["facilityIds", "id", "workerCode"]);
  });
});

describe("ADM-02 metric source reads", () => {
  it("getMetricsRecords: scoped rows, no patient identifiers, demo-clock asOf", async () => {
    const h = await createHarness({ appId: "admin", personaId: PERSONA_IDS.analystAlpha });
    // HWM-04 optional registration detail on an in-scope patient must be blanked too.
    const seeded = (await h.store.getAll<Patient>("patients")).find(
      (p) => p.districtId === DISTRICT_IDS.alpha,
    );
    if (seeded === undefined) throw new Error("no seeded patient in district alpha");
    const withDetail: Patient = {
      ...seeded,
      villageLabel: "Demo Cell A",
      syntheticPhone: "0780000001",
    };
    await h.store.put("patients", withDetail);
    const result = await h.repo.getMetricsRecords({ from: "2026-07-17", to: "2026-10-14" });
    expect(result.asOf).toBe("2026-10-14T06:00:00.000Z");
    expect(result.lastWriteAt).not.toBeNull();
    const { records } = result;
    expect(records.screenings.length).toBeGreaterThan(0);
    expect(records.screenings.every((s) => s.districtId === DISTRICT_IDS.alpha)).toBe(true);
    expect(records.facilities.map((f) => f.id).sort()).toEqual(
      [FACILITY_IDS.alpha1, FACILITY_IDS.alpha2].sort(),
    );
    expect(
      records.patients.every((p) => p.displayName === "" && p.syntheticIdentifier === ""),
    ).toBe(true);
    expect(records.patients.some((p) => p.id === seeded.id)).toBe(true);
    expect(
      records.patients.every(
        (p) => p.dateOfBirth === null && !("villageLabel" in p) && !("syntheticPhone" in p),
      ),
    ).toBe(true);
    expect(records.timeEntries.every((e) => e.facilityId !== FACILITY_IDS.beta1)).toBe(true);
    // No free text (notes, reasons, evidence references) leaves an aggregate read.
    expect(records.screenings.every((s) => s.notes === "")).toBe(true);
    expect(records.reviews.every((r) => (r.decision?.note ?? "") === "")).toBe(true);
    expect(records.reviews.every((r) => [null, "[redacted]"].includes(r.decisionReason))).toBe(
      true,
    );
    expect(
      records.referrals.every(
        (r) =>
          r.referralReason === undefined &&
          [undefined, "[redacted]"].includes(r.completionEvidence?.reference) &&
          (r.completionEvidence?.note ?? "") === "",
      ),
    ).toBe(true);
    expect(
      records.followUps.every(
        (f) =>
          f.attempts.every((a) => a.note === "") &&
          (f.outcome?.note ?? "") === "" &&
          f.notes.every((n) => n.text === "[redacted]") &&
          f.clinicianConfirmation.reason === undefined,
      ),
    ).toBe(true);
    await expect(
      h.repo.getMetricsRecords({ districtIds: [DISTRICT_IDS.beta] }),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("listTimeEntries: scope + date range; clinicians are denied", async () => {
    const h = await createHarness({ appId: "admin", personaId: PERSONA_IDS.fmgrAlpha1 });
    const entries = await h.repo.listTimeEntries();
    expect(entries.length).toBeGreaterThan(0);
    expect(entries.every((e) => e.facilityId === FACILITY_IDS.alpha1)).toBe(true);
    const day = entries[0]?.date ?? "2026-10-01";
    const one = await h.repo.listTimeEntries({ from: day, to: day });
    expect(one.every((e) => e.date === day)).toBe(true);
    const c = await createHarness({ personaId: PERSONA_IDS.clinAlpha1 });
    await expect(c.repo.listTimeEntries()).rejects.toMatchObject({ reason: "ROLE" });
  });

  it("getMetricsFreshness reports the latest write", async () => {
    const h = await createHarness({ appId: "admin", personaId: PERSONA_IDS.leadProgramme });
    const { lastWriteAt } = await h.repo.getMetricsFreshness();
    const { lastWriteAt: fromRecords } = await h.repo.getMetricsRecords();
    expect(lastWriteAt).toBe(fromRecords);
  });
});
