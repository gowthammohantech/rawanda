/**
 * ADM-07: `recordExport` stores an ExportAudit (generated / denied) next to the audit events, and
 * `listExportAudits` returns the history (own attempts + in-scope exports for governance roles).
 */
import { ExportAuditSchema, type ExportAudit } from "@laif/contracts";
import type { AuditEvent } from "@laif/domain";
import { DISTRICT_IDS, FACILITY_IDS, PERSONA_IDS } from "@laif/mock-data";
import { describe, expect, it } from "vitest";

import { createHarness, uuid } from "./testing/harness.ts";

const exportInput = {
  reasonCode: "district_meeting" as const,
  template: "programme_summary",
  granularity: "facility" as const,
  scope: {
    districtIds: [DISTRICT_IDS.alpha],
    facilityIds: [FACILITY_IDS.alpha1, FACILITY_IDS.alpha2],
  },
  filters: { preset: "90d" },
  period: { from: "2026-07-17", to: "2026-10-14" },
  rowCount: 14,
  suppressedCells: 3,
  sha256: "b".repeat(64),
  exportId: uuid(9001),
  fileName: "laif-demo_programme_summary_dist-alpha_2026-07-17_2026-10-14_00000000.csv",
  csvText: "# DEMONSTRATION — SYNTHETIC PATIENT DATA — NOT FOR CLINICAL USE\r\n",
  grantId: "grant-analyst-alpha",
};

const audits = async (h: Awaited<ReturnType<typeof createHarness>>) =>
  (await h.store.getAll<ExportAudit>("exportAudits")).map((r) => ExportAuditSchema.parse(r));
const events = async (h: Awaited<ReturnType<typeof createHarness>>, action: string) =>
  // Seeded audit history contains earlier demo exports; only ADM-07 records are counted.
  (await h.store.getAll<AuditEvent>("auditEvents")).filter(
    (e) => e.action === action && e.entityType === "export_audit",
  );

describe("recordExport → ExportAudit (ADM-07)", () => {
  it("stores one generated record per key with the CSV bytes; a replay adds nothing", async () => {
    const h = await createHarness({ appId: "admin", personaId: PERSONA_IDS.analystAlpha });
    const key = h.key();
    const first = await h.repo.recordExport(exportInput, key);
    expect(first.data).toMatchObject({
      action: "export.generated",
      entityType: "export_audit",
      entityId: exportInput.exportId,
      justification: "district_meeting",
      changeSummary: {
        exportId: exportInput.exportId,
        reasonCode: "district_meeting",
        rowCount: 14,
        suppressedCells: 3,
        sha256: exportInput.sha256,
        actorRole: "district_analyst",
        idempotencyKey: key,
      },
    });
    const replay = await h.repo.recordExport(exportInput, key);
    expect(replay.replayed).toBe(true);
    expect(replay.data.id).toBe(first.data.id);

    const rows = await audits(h);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      id: exportInput.exportId,
      idempotencyKey: key,
      actorId: PERSONA_IDS.analystAlpha,
      role: "district_analyst",
      status: "generated",
      deniedReason: null,
      csvText: exportInput.csvText,
      fileName: exportInput.fileName,
      period: exportInput.period,
    });
    expect(await events(h, "export.generated")).toHaveLength(1);
    const listed = await h.repo.listExportAudits({ idempotencyKey: key });
    expect(listed.map((r) => r.id)).toEqual([exportInput.exportId]);
  });

  it("capability denial: FORBIDDEN, export.denied and a denied ExportAudit row (no file)", async () => {
    const h = await createHarness({ appId: "admin", personaId: PERSONA_IDS.fmgrAlpha1 });
    await expect(
      h.repo.recordExport(
        {
          ...exportInput,
          scope: { districtIds: [], facilityIds: [FACILITY_IDS.alpha1] },
        },
        h.key(),
      ),
    ).rejects.toMatchObject({ code: "FORBIDDEN", reason: "ROLE" });
    const rows = await audits(h);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      status: "denied",
      deniedReason: "capability",
      actorId: PERSONA_IDS.fmgrAlpha1,
      role: "facility_manager",
      csvText: null,
      sha256: null,
      rowCount: 0,
    });
    const denied = await events(h, "export.denied");
    expect(denied).toHaveLength(1);
    expect(denied[0]).toMatchObject({
      outcome: "denied",
      category: "export",
      entityType: "export_audit",
      changeSummary: { denial: "capability", permission: "export.aggregate" },
    });
    expect(await events(h, "export.generated")).toHaveLength(0);
    // The facility manager sees their own denied attempt in the history.
    expect((await h.repo.listExportAudits()).map((r) => r.status)).toEqual(["denied"]);
  });

  it("scope denial (District Alpha analyst requesting District Beta): FORBIDDEN, denied row", async () => {
    const h = await createHarness({ appId: "admin", personaId: PERSONA_IDS.analystAlpha });
    await expect(
      h.repo.recordExport(
        { ...exportInput, scope: { districtIds: [DISTRICT_IDS.beta], facilityIds: [] } },
        h.key(),
      ),
    ).rejects.toMatchObject({ code: "FORBIDDEN", reason: "SCOPE" });
    await expect(
      h.repo.recordExport(
        { ...exportInput, scope: { districtIds: [], facilityIds: [FACILITY_IDS.beta1] } },
        h.key(),
      ),
    ).rejects.toMatchObject({ code: "FORBIDDEN", reason: "SCOPE" });
    const rows = await audits(h);
    expect(rows.map((r) => [r.status, r.deniedReason])).toEqual([
      ["denied", "scope"],
      ["denied", "scope"],
    ]);
    const denied = await events(h, "export.denied");
    expect(denied.map((e) => (e.changeSummary as Record<string, unknown>)["requested"])).toEqual([
      { districtIds: [DISTRICT_IDS.beta], facilityIds: [] },
      { districtIds: [], facilityIds: [FACILITY_IDS.beta1] },
    ]);
    expect(denied.map((e) => e.districtId)).toEqual([DISTRICT_IDS.beta, DISTRICT_IDS.beta]);
  });

  it("history: governance roles see in-scope exports of others; others only their own", async () => {
    const h = await createHarness({ appId: "admin", personaId: PERSONA_IDS.analystAlpha });
    await h.repo.recordExport(exportInput, h.key());
    h.as(PERSONA_IDS.auditorProgramme);
    expect((await h.repo.listExportAudits()).map((r) => r.id)).toEqual([exportInput.exportId]);
    h.as(PERSONA_IDS.leadProgramme);
    expect(await h.repo.listExportAudits()).toHaveLength(1);
    h.as(PERSONA_IDS.fmgrAlpha1);
    expect(await h.repo.listExportAudits()).toEqual([]);
  });

  it("rejects a reused export id under a new key", async () => {
    const h = await createHarness({ appId: "admin", personaId: PERSONA_IDS.analystAlpha });
    await h.repo.recordExport(exportInput, h.key());
    await expect(h.repo.recordExport(exportInput, h.key())).rejects.toMatchObject({
      code: "VALIDATION_ERROR",
      fieldErrors: { exportId: { key: "invalid" } },
    });
    expect(await audits(h)).toHaveLength(1);
  });
});
