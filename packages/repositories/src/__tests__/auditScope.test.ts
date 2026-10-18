/**
 * CLN-10: audit-log facility scoping enforced INSIDE the repository (FRD §4 last bullet), the
 * `actions` filter, out-of-scope filter values (ignored + `access.denied`), and the audit-export
 * path (`recordExport` template `audit_*` → `audit.export`, role + facility scope).
 */
import type { AuditEvent, Patient } from "@laif/domain";
import { FACILITY_IDS, PERSONA_IDS, SEED_ANCHORS } from "@laif/mock-data";
import { describe, expect, it } from "vitest";

import type { AuditFilterInput } from "../care-repository.ts";
import { createHarness, type Harness } from "../testing/harness.ts";

const WF04 = SEED_ANCHORS.WF04_OTHER_FACILITY_PATIENT;

const summaryOf = (e: AuditEvent): Record<string, unknown> =>
  typeof e.changeSummary === "object" && e.changeSummary !== null && !Array.isArray(e.changeSummary)
    ? e.changeSummary
    : {};

async function listAll(h: Harness, filter: AuditFilterInput = {}): Promise<AuditEvent[]> {
  const items: AuditEvent[] = [];
  for (let page = 1; ; page += 1) {
    const result = await h.repo.listAuditEvents({ ...filter, page, pageSize: 200 });
    items.push(...result.items);
    if (result.items.length === 0 || items.length >= result.total) return items;
  }
}

const auditExport = (facilityIds: string[]) => ({
  reasonCode: "other" as const,
  reasonText: "Facility audit log review (clinical portal)",
  template: "audit_log",
  granularity: "facility" as const,
  scope: { districtIds: [], facilityIds },
  filters: { actionFamily: "all" },
  rowCount: 3,
  suppressedCells: 0,
  sha256: "a".repeat(64),
});

describe("listAuditEvents facility scope (CLN-10)", () => {
  it("an Alpha-1 clinician sees only Alpha-1 events, plus own unbound / own denied ones", async () => {
    const h = await createHarness({ appId: "clinical", personaId: PERSONA_IDS.clinBeta1 });
    // Another actor's unbound event (no facility) must stay invisible to Alpha-1.
    await h.repo.recordAuditEvent({ action: "session.started" });
    h.as(PERSONA_IDS.clinAlpha1);
    await expect(h.repo.getPatient(WF04.patientId)).rejects.toMatchObject({ code: "FORBIDDEN" });

    const rows = await listAll(h);
    expect(rows.length).toBeGreaterThan(0);
    for (const e of rows) {
      const own = e.actorId === PERSONA_IDS.clinAlpha1;
      const ok =
        e.facilityId === FACILITY_IDS.alpha1 ||
        (own && (e.facilityId === null || e.outcome === "denied"));
      expect(ok, `${e.action} ${e.facilityId ?? "null"} ${e.actorId ?? "system"}`).toBe(true);
    }
    expect(rows.some((e) => e.actorId === PERSONA_IDS.clinBeta1 && e.facilityId === null)).toBe(
      false,
    );
    // No Beta-1 record except the clinician's own denied attempt (WF-04 evidence).
    const beta = rows.filter((e) => e.facilityId === FACILITY_IDS.beta1);
    expect(beta.every((e) => e.outcome === "denied" && e.actorId === PERSONA_IDS.clinAlpha1)).toBe(
      true,
    );
    const denied = await listAll(h, { outcome: "denied" });
    expect(denied.some((e) => e.action === "access.denied" && e.entityId === WF04.patientId)).toBe(
      true,
    );
  });

  it("a Beta-1 facility filter is refused; a Beta-1 entity filter returns nothing and is audited once", async () => {
    const h = await createHarness({ appId: "clinical", personaId: PERSONA_IDS.clinAlpha1 });
    await expect(
      h.repo.listAuditEvents({ facilityIds: [FACILITY_IDS.beta1] }),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });

    const before = (await h.store.getAll<AuditEvent>("auditEvents")).filter(
      (e) => e.action === "access.denied" && summaryOf(e)["via"] === "audit_filter",
    );
    expect(before).toHaveLength(0);
    const page = await h.repo.listAuditEvents({ entityId: WF04.reviewId });
    expect(page.total).toBe(0);
    await h.repo.listAuditEvents({ entityId: WF04.reviewId });
    const after = (await h.store.getAll<AuditEvent>("auditEvents")).filter(
      (e) => e.action === "access.denied" && summaryOf(e)["via"] === "audit_filter",
    );
    expect(after).toHaveLength(1);
    expect(after[0]).toMatchObject({
      outcome: "denied",
      actorId: PERSONA_IDS.clinAlpha1,
      entityId: WF04.reviewId,
    });
  });

  it("a Beta-1 patient filter (synthetic identifier) returns nothing and is audited once", async () => {
    const h = await createHarness({ appId: "clinical", personaId: PERSONA_IDS.clinAlpha1 });
    const patient = (await h.store.getAll<Patient>("patients")).find(
      (p) => p.id === WF04.patientId,
    );
    expect(patient?.facilityId).toBe(FACILITY_IDS.beta1);
    const synthetic = patient?.syntheticIdentifier ?? "";
    // Seed the patient's audit history (Beta-1 clinician opens the record).
    h.as(PERSONA_IDS.clinBeta1);
    await h.repo.getPatient(WF04.patientId);
    h.as(PERSONA_IDS.clinAlpha1);
    const page = await h.repo.listAuditEvents({ patientId: synthetic.toLowerCase() });
    expect(page.total).toBe(0);
    const denied = (await h.store.getAll<AuditEvent>("auditEvents")).filter(
      (e) => e.action === "access.denied" && summaryOf(e)["via"] === "audit_filter",
    );
    expect(denied).toHaveLength(1);
    expect(denied[0]).toMatchObject({ actorId: PERSONA_IDS.clinAlpha1, outcome: "denied" });
    expect(summaryOf(denied[0] as AuditEvent)["filter"]).toBe("patientId");
  });

  it("filters by a list of actions / prefixes and records the filter summary in audit.viewed", async () => {
    const h = await createHarness({ appId: "clinical", personaId: PERSONA_IDS.clinAlpha1 });
    const rows = await listAll(h, { actions: ["review.decided", "referral."] });
    expect(rows.length).toBeGreaterThan(0);
    expect(
      rows.every((e) => e.action === "review.decided" || e.action.startsWith("referral.")),
    ).toBe(true);
    const viewed = (await h.store.getAll<AuditEvent>("auditEvents")).filter(
      (e) => e.action === "audit.viewed",
    );
    expect(viewed).toHaveLength(1);
    expect((viewed[0] ? summaryOf(viewed[0]) : {})["filters"]).toEqual({
      actions: ["review.decided", "referral."],
    });
  });
});

describe("audit export path (CLN-10, T-08)", () => {
  it("a nurse reviewer is refused (ROLE) with export.denied; no export.generated", async () => {
    const h = await createHarness({ appId: "clinical", personaId: PERSONA_IDS.nurseAlpha2 });
    await expect(
      h.repo.recordExport(auditExport([FACILITY_IDS.alpha2]), h.key()),
    ).rejects.toMatchObject({ code: "FORBIDDEN", reason: "ROLE" });
    const events = await h.store.getAll<AuditEvent>("auditEvents");
    const mine = events.filter((e) => e.actorId === PERSONA_IDS.nurseAlpha2);
    expect(mine.some((e) => e.action === "export.denied")).toBe(true);
    expect(mine.some((e) => e.action === "export.generated")).toBe(false);
  });

  it("a coordinator may export its facility, not Beta-1 (SCOPE)", async () => {
    const h = await createHarness({ appId: "clinical", personaId: PERSONA_IDS.coordAlpha });
    await expect(
      h.repo.recordExport(auditExport([FACILITY_IDS.beta1]), h.key()),
    ).rejects.toMatchObject({ code: "FORBIDDEN", reason: "SCOPE" });
    const result = await h.repo.recordExport(auditExport([FACILITY_IDS.alpha1]), h.key());
    expect(result.data).toMatchObject({
      action: "export.generated",
      entityType: "export_audit",
      actorId: PERSONA_IDS.coordAlpha,
      changeSummary: { template: "audit_log", rowCount: 3, facilityIds: [FACILITY_IDS.alpha1] },
    });
  });
});
