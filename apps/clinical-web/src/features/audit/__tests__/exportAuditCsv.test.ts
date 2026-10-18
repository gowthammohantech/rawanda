/**
 * CLN-10 audit CSV (T-08): BOM + watermark + bilingual scope / exported-by / filters lines, the
 * id-only columns, no patient display names or free-text rationale, CSV-injection guard, and the
 * export audited FIRST (`export.generated` stored before the download; denied / failed → no file).
 */
import { CSV_BOM, CSV_WATERMARK, CSV_WATERMARK_RW } from "@laif/analytics";
import type { AuditEvent, Patient } from "@laif/domain";
import { createTestI18n } from "@laif/i18n";
import { FACILITY_IDS, PERSONA_IDS, createSeed } from "@laif/mock-data";
import type { StoreAdapter } from "@laif/repositories";
import type { TranslationKey, TranslationValues } from "@laif/ui-web";
import { describe, expect, it } from "vitest";

import { createTestClinicalRepo } from "../../../test/test-repository.ts";
import {
  AUDIT_CSV_COLUMNS,
  ForbiddenExportValueError,
  buildAuditCsv,
  performAuditExport,
  type AuditExportRequest,
} from "../exportAuditCsv.ts";

const COORD = { personaId: PERSONA_IDS.coordAlpha, facilityId: FACILITY_IDS.alpha1 };
const NURSE = { personaId: PERSONA_IDS.nurseAlpha2, facilityId: FACILITY_IDS.alpha2 };

type Tx = (key: TranslationKey, values?: TranslationValues) => string;
const tx = (lng: "en" | "rw"): Tx => {
  const t = createTestI18n(lng).t as unknown as (k: string, v?: TranslationValues) => string;
  return (key, values) => t(key, values);
};
const T = { en: tx("en"), rw: tx("rw") };

const seedPatients = (): Patient[] => createSeed().patients;

function patientsMap(facilityId: string) {
  return new Map(
    seedPatients()
      .filter((p) => p.facilityId === facilityId)
      .map((p) => [p.id as string, p]),
  );
}

function request(
  persona: { id: string; displayName: string; role: "facility_coordinator" | "nurse_reviewer" },
  facilityId: (typeof FACILITY_IDS)[keyof typeof FACILITY_IDS],
  n: number,
): AuditExportRequest {
  return {
    filter: { actions: ["review.decided", "review.dismissed", "referral.created"] },
    filters: { chip: "decisions" },
    filtersText: "chip=decisions",
    persona,
    facilityId,
    nowIso: "2026-10-14T06:00:00.000Z",
    period: {},
    patients: patientsMap(facilityId),
    idempotencyKey: `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`,
    exportId: `00000000-0000-4000-9000-${String(n).padStart(12, "0")}`,
  };
}

const events = async (store: StoreAdapter, action: string) =>
  (await store.getAll<AuditEvent>("auditEvents")).filter(
    (e) => e.action === action && e.entityType === "export_audit",
  );

describe("buildAuditCsv", () => {
  it("guards CSV injection and refuses patient display names", () => {
    const event = {
      id: "evt-1",
      occurredAt: "2026-10-14T06:00:00.000Z",
      action: "review.decided",
      actorId: null,
      actorRole: null,
      entityType: "review",
      entityId: "=HYPERLINK(1)",
      patientId: null,
      facilityId: null,
      correlationId: "c-1",
    } as unknown as AuditEvent;
    const lines = {
      synthetic: "s",
      scope: { en: "Scope", rw: "Aho" },
      exportedBy: { en: "By", rw: "Na" },
      filters: { en: "Filters: none\r\n=1+1", rw: "Ibyungurura" },
      notice: { en: "n", rw: "n" },
    };
    const csv = buildAuditCsv({ exportId: "x", rows: [event], syntheticIdOf: () => null, lines });
    expect(csv.text).toContain("'=HYPERLINK(1)");
    expect(csv.text).toContain("# Filters: none =1+1");
    expect(() =>
      buildAuditCsv({
        exportId: "x",
        rows: [event],
        syntheticIdOf: () => null,
        lines: { ...lines, scope: { en: "Quavox Zuxoumbra", rw: "x" } },
        forbiddenValues: ["Quavox Zuxoumbra"],
      }),
    ).toThrow(ForbiddenExportValueError);
  });
});

describe("performAuditExport", () => {
  it("coordinator: watermark, bilingual scope lines, id columns, no names; audited before the file", async () => {
    const { repo, store } = await createTestClinicalRepo(COORD);
    const order: string[] = [];
    const files: { text: string; name: string }[] = [];
    const tracked: typeof repo = {
      ...repo,
      recordExport: async (...args: Parameters<typeof repo.recordExport>) => {
        const out = await repo.recordExport(...args);
        order.push("export.generated");
        return out;
      },
    };
    const result = await performAuditExport(
      {
        repo: tracked,
        t: T,
        download: (text, name) => {
          order.push("download");
          files.push({ text, name });
        },
      },
      request(
        { id: PERSONA_IDS.coordAlpha, displayName: "Coordinator", role: "facility_coordinator" },
        FACILITY_IDS.alpha1,
        1,
      ),
    );
    expect(order).toEqual(["export.generated", "download"]);
    expect(files).toHaveLength(1);
    const generated = await events(store, "export.generated");
    expect(generated).toHaveLength(1);
    expect(generated[0]?.id).toBe(result.auditEventId);
    expect(generated[0]?.changeSummary).toMatchObject({
      template: "audit_log",
      rowCount: result.rowCount,
      facilityIds: [FACILITY_IDS.alpha1],
    });
    expect(await events(store, "export.requested")).toHaveLength(1);

    const text = files[0]?.text ?? "";
    const lines = text.replace(CSV_BOM, "").split("\r\n");
    expect(lines[0]).toBe(CSV_WATERMARK);
    expect(lines[1]).toBe(CSV_WATERMARK_RW);
    expect(lines[2]).toBe("# Synthetic demonstration data");
    expect(text).toContain("# Scope: Demo Health Centre Alpha-1 (demo)");
    expect(text).toContain("# Aho bireba: Ikigo Nderabuzima cy'Igerageza Alpha-1 (igeragezwa)");
    expect(text).toMatch(
      /# Exported by Coordinator \(Facility coordinator\) at 14 Oct 2026, 08:00/,
    );
    expect(text).toContain("# Filters: chip=decisions");
    expect(text).toContain("# Ibyungurura: chip=decisions");
    expect(text).toContain(AUDIT_CSV_COLUMNS.join(","));
    expect(result.rowCount).toBeGreaterThan(0);
    expect(files[0]?.name).toMatch(
      /^laif-demo_audit_log_fac-alpha-1_\d{4}-\d{2}-\d{2}_2026-10-14_[0-9a-f]{8}\.csv$/,
    );

    // No patient display names and no free-text rationale.
    for (const p of seedPatients()) expect(text).not.toContain(p.displayName);
    const rationale = (await store.getAll<AuditEvent>("auditEvents"))
      .map((e) => e.justification)
      .filter((j): j is string => j !== null && j.length >= 12);
    for (const j of rationale) expect(text).not.toContain(j);
    // Synthetic identifiers are written for in-scope patients.
    expect(text).toMatch(/DEMO-P-\d{4}/);
  });

  it("nurse reviewer: refused by the repository (export.denied), no file, no export.generated", async () => {
    const { repo, store } = await createTestClinicalRepo(NURSE);
    let downloads = 0;
    await expect(
      performAuditExport(
        { repo, t: T, download: () => (downloads += 1) },
        request(
          { id: PERSONA_IDS.nurseAlpha2, displayName: "Nurse", role: "nurse_reviewer" },
          FACILITY_IDS.alpha2,
          2,
        ),
      ),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect(downloads).toBe(0);
    expect(await events(store, "export.generated")).toHaveLength(0);
    expect(await events(store, "export.denied")).toHaveLength(1);
  });

  it("a failing append (offline) produces no file", async () => {
    const { repo, store } = await createTestClinicalRepo(COORD);
    const req = request(
      { id: PERSONA_IDS.coordAlpha, displayName: "Coordinator", role: "facility_coordinator" },
      FACILITY_IDS.alpha1,
      3,
    );
    const failing: typeof repo = {
      ...repo,
      recordExport: () => Promise.reject(new Error("append failed")),
    };
    let downloads = 0;
    await expect(
      performAuditExport({ repo: failing, t: T, download: () => (downloads += 1) }, req),
    ).rejects.toThrow("append failed");
    expect(downloads).toBe(0);
    expect(await events(store, "export.generated")).toHaveLength(0);
  });
});
