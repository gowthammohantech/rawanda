import type { AuditEvent } from "@laif/domain";
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
