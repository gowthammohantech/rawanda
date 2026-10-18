/**
 * ADM-07 export CSV: BOM, watermark + metadata order, explicit scope ids, RFC 4180 quoting and
 * the CSV-injection guard on label cells, the `# END` trailer checksum, suppressed rows blank,
 * and `assertAggregateOnly` on every build.
 */
import {
  AggregateOnlyError,
  CSV_META_KEYS,
  CSV_WATERMARK,
  CSV_WATERMARK_RW,
  REPORT_CSV_COLUMNS,
  sha256Hex,
} from "@laif/analytics";
import { createSeed, DISTRICT_IDS, FACILITY_IDS, PERSONA_IDS } from "@laif/mock-data";
import { describe, expect, it } from "vitest";

import type { Tx } from "../../app/persona-labels.ts";
import { buildExportCsv } from "./exportCsv.ts";
import { loadReport, signedInServices } from "./testing.ts";

const EXPORT_ID = "6f1c2a9e-8b7d-4c6e-9a1b-2d3e4f5a6b7d";
const ALL = { district: null, facility: null };

async function analystCsv(t?: (base: Tx) => Tx) {
  const { services, t: base } = await signedInServices(PERSONA_IDS.analystAlpha);
  const data = await loadReport(services, "programme_summary", "facility");
  return buildExportCsv(data, ALL, t === undefined ? base : t(base), {
    exportId: EXPORT_ID,
    generatedAt: services.clock.now(),
    personaId: PERSONA_IDS.analystAlpha,
    role: "district_analyst",
    reasonCode: "district_meeting",
  });
}

describe("export CSV (District Alpha analyst, programme summary by facility)", () => {
  it("BOM, watermark, RW line, synthetic line, then the metadata in order", async () => {
    const csv = await analystCsv();
    expect(csv.text.charCodeAt(0)).toBe(0xfeff);
    const lines = csv.text.slice(1).split("\r\n");
    expect(lines[0]).toBe(CSV_WATERMARK);
    expect(lines[1]).toBe(CSV_WATERMARK_RW);
    expect(lines[2]).toBe("# Synthetic demonstration data");
    const meta = lines.slice(3, 3 + CSV_META_KEYS.length);
    expect(meta.map((l) => /^# ([a-z_]+)=/.exec(l)?.[1])).toEqual([...CSV_META_KEYS]);
    expect(meta).toContain(`# export_id=${EXPORT_ID}`);
    expect(meta).toContain(`# scope_districts=${DISTRICT_IDS.alpha}`);
    expect(meta).toContain(`# scope_facilities=${FACILITY_IDS.alpha1};${FACILITY_IDS.alpha2}`);
    expect(meta).toContain("# suppression_threshold=5");
    expect(meta).toContain("# suppression_policy=DEMO_NOT_APPROVED");
    expect(meta).toContain("# reason_code=district_meeting");
    expect(meta.find((l) => l.startsWith("# period="))).toMatch(/^# period=\d{4}-\d{2}-\d{2}\//);
    expect(lines[3 + CSV_META_KEYS.length]).toBe(REPORT_CSV_COLUMNS.join(","));
    expect(csv.fileName).toMatch(
      /^laif-demo_programme_summary_dist-alpha_\d{4}-\d{2}-\d{2}_2026-10-14_6f1c2a9e\.csv$/,
    );
    expect(csv.text).not.toContain(DISTRICT_IDS.beta);
    expect(csv.text).not.toContain(FACILITY_IDS.beta1);
    expect(csv.text.endsWith("\r\n")).toBe(true);
  });

  it("trailer: row count, suppressed cells and SHA-256 of the data rows", async () => {
    const csv = await analystCsv();
    const lines = csv.text.slice(1).split("\r\n");
    const header = lines.indexOf(REPORT_CSV_COLUMNS.join(","));
    const data = lines.slice(header + 1, header + 1 + csv.rowCount);
    expect(csv.rowCount).toBe(2 * 7);
    expect(lines[header + 1 + csv.rowCount]).toBe(
      `# END rows=${csv.rowCount} suppressed_cells=${csv.suppressedCells} sha256=${csv.sha256}`,
    );
    expect(csv.sha256).toBe(sha256Hex(data.join("\r\n")));
    // Every suppressed row has value / numerator / denominator empty.
    const suppressed = csv.rows.filter((r) => r.suppressed);
    expect(suppressed.length).toBe(csv.suppressedCells);
    expect(suppressed.every((r) => r.value === null && r.numerator === null)).toBe(true);
    for (const line of data.filter((l) => l.includes(",true,"))) {
      expect(line).toMatch(/,,true,,,demo-metrics-1$/);
    }
  });

  it("neutralises a label starting with = and quotes commas / quotes (RFC 4180)", async () => {
    const csv = await analystCsv(
      (base) => (key, values) =>
        String(key).startsWith("admin:reports.metric.screened")
          ? '=HYPERLINK("x"),1'
          : base(key, values),
    );
    expect(csv.text).toContain(`,"'=HYPERLINK(""x""),1",`);
    expect(csv.text).not.toMatch(/,=HYPERLINK/);
  });

  it("Kinyarwanda labels keep their characters (UTF-8 with BOM)", async () => {
    const { services, t } = await signedInServices(PERSONA_IDS.analystAlpha);
    await services.i18n.setLanguage("rw");
    const data = await loadReport(services, "programme_summary", "facility");
    const csv = buildExportCsv(data, ALL, t, {
      exportId: EXPORT_ID,
      generatedAt: services.clock.now(),
      personaId: PERSONA_IDS.analystAlpha,
      role: "district_analyst",
      reasonCode: "district_meeting",
    });
    expect(csv.text.charCodeAt(0)).toBe(0xfeff);
    expect(csv.text).toContain("Isuzuma ryanditswe");
    expect(csv.rows[0]?.metric_id).toBe("screened");
    // Watermark lines stay English (+ the RW line) for machine checks.
    expect(csv.text.slice(1).startsWith(CSV_WATERMARK)).toBe(true);
  });

  it("assertAggregateOnly runs on every build: an identifier or a patient name is rejected", async () => {
    const seed = createSeed();
    const patient = seed.patients[0]!;
    await expect(
      analystCsv(
        (base) => (key, values) =>
          String(key) === "admin:reports.metric.flagged"
            ? patient.syntheticIdentifier
            : base(key, values),
      ),
    ).rejects.toThrow(AggregateOnlyError);
    const { services, t } = await signedInServices(PERSONA_IDS.analystAlpha);
    const data = await loadReport(services, "programme_summary", "facility");
    const nameT = ((key, values) =>
      String(key) === "admin:reports.metric.flagged"
        ? `Flagged ${patient.displayName}`
        : t(key, values)) as Tx;
    expect(() =>
      buildExportCsv(data, ALL, nameT, {
        exportId: EXPORT_ID,
        generatedAt: services.clock.now(),
        personaId: PERSONA_IDS.analystAlpha,
        role: "district_analyst",
        reasonCode: "district_meeting",
        forbiddenValues: seed.patients.map((p) => p.displayName),
      }),
    ).toThrow(/forbidden_value/);
  });
});
