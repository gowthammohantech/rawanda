/**
 * ADM-07: report rows (fixed columns, suppression blanking, template guard), the extended CSV
 * builder (BOM, `# END` trailer + SHA-256, derived `suppressed` flag) and `assertAggregateOnly`.
 * Parity with the on-screen selectors is tested in the admin app (`features/reports`), where the
 * scope-wide suppression pass lives.
 */
import { createDemoClock } from "@laif/domain";
import { ADMIN_DUPLICATE_IDENTIFIER, createSeed, PERSONA_IDS } from "@laif/mock-data";
import { describe, expect, it } from "vitest";

import type { AggregateCell } from "./aggregate-cells.ts";
import {
  AggregateOnlyError,
  assertAggregateOnly,
  buildAggregateCsv,
  CSV_BOM,
  CSV_WATERMARK,
  REPORT_CSV_COLUMNS,
  type AggregateCsvMeta,
} from "./csv.ts";
import {
  assertReportAggregateOnly,
  buildReportRows,
  countSuppressedRows,
  reportRowsToAggregateRows,
  type ReportSection,
  type ReportTemplateSpec,
} from "./reports.ts";
import { sha256Hex } from "./sha256.ts";

const now = createDemoClock().now();
const cell = (key: string, value: number | null, suppressed = false): AggregateCell =>
  suppressed ? { key, value: null, suppressed, reason: "PRIMARY" } : { key, value, suppressed };

const template: ReportTemplateSpec = {
  id: "programme_summary",
  metricIds: ["screened", "followUpCompleted", "completedOfReferred"],
  granularities: ["scope_total", "facility", "week"],
};

const labels = {
  district: (id: string) => `District ${id}`,
  facility: (id: string) => `Facility ${id}`,
  metric: (id: string) => `Label ${id}`,
};

const sections: ReportSection[] = [
  {
    node: {
      granularity: "facility",
      districtId: "dist-alpha",
      facilityId: "fac-alpha-1",
      weekStart: null,
    },
    metrics: [
      { metricId: "screened", cell: cell("screened", 40) },
      { metricId: "followUpCompleted", cell: cell("followUpCompleted", null, true) },
      {
        metricId: "completedOfReferred",
        cell: cell("completedOfReferred", 0.5),
        numerator: cell("n", 3, true),
        denominator: cell("d", 6),
      },
    ],
  },
  {
    node: {
      granularity: "facility",
      districtId: "dist-alpha",
      facilityId: "fac-alpha-2",
      weekStart: null,
    },
    metrics: [
      {
        metricId: "completedOfReferred",
        cell: cell("completedOfReferred", 0.75),
        numerator: cell("n", 6),
        denominator: cell("d", 8),
      },
    ],
  },
];

const options = {
  period: { from: "2026-07-17", to: "2026-10-14" },
  granularity: "facility" as const,
  labels,
};

describe("buildReportRows", () => {
  const rows = buildReportRows(template, sections, options);

  it("writes one row per (node, metric) with the fixed columns and labels", () => {
    expect(rows).toHaveLength(4);
    expect(Object.keys(rows[0] ?? {})).toEqual([...REPORT_CSV_COLUMNS]);
    expect(rows[0]).toEqual({
      period_start: "2026-07-17",
      period_end: "2026-10-14",
      granularity: "facility",
      district_id: "dist-alpha",
      district_label: "District dist-alpha",
      facility_id: "fac-alpha-1",
      facility_label: "Facility fac-alpha-1",
      week_start: null,
      metric_id: "screened",
      metric_label: "Label screened",
      value: 40,
      suppressed: false,
      numerator: null,
      denominator: null,
      metric_version: "demo-metrics-1",
    });
    expect(rows[3]).toMatchObject({ value: 0.75, numerator: 6, denominator: 8, suppressed: false });
  });

  it("blanks value / numerator / denominator when the cell or a part of it is suppressed", () => {
    expect(rows[1]).toMatchObject({ value: null, suppressed: true, numerator: null });
    // The rate itself was shown, but its numerator is hidden → the whole row is suppressed.
    expect(rows[2]).toMatchObject({
      value: null,
      suppressed: true,
      numerator: null,
      denominator: null,
    });
    expect(countSuppressedRows(rows)).toBe(2);
  });

  it("rejects metrics outside the template and granularities it does not offer", () => {
    expect(() =>
      buildReportRows(
        template,
        [{ node: sections[0]!.node, metrics: [{ metricId: "patients", cell: cell("x", 1) }] }],
        options,
      ),
    ).toThrow(RangeError);
    expect(() =>
      buildReportRows(template, sections, { ...options, granularity: "district" }),
    ).toThrow(RangeError);
    expect(() => buildReportRows(template, sections, { ...options, granularity: "week" })).toThrow(
      RangeError,
    );
  });
});

const meta: AggregateCsvMeta = {
  exportId: "exp-0001",
  generatedAt: now,
  generatedByPersonaId: PERSONA_IDS.analystAlpha,
  generatedByRole: "district_analyst",
  scope: { districtIds: ["dist-alpha"], facilityIds: ["fac-alpha-1", "fac-alpha-2"] },
  period: { from: "2026-07-17", to: "2026-10-14" },
  template: "programme_summary",
  granularity: "facility",
  suppressionThreshold: 5,
  rulesetVersions: ["demo-ruleset-2026.10-v1"],
  reasonCode: "district_meeting",
};

describe("buildAggregateCsv (ADM-07 options)", () => {
  const rows = buildReportRows(template, sections, options);
  const csv = buildAggregateCsv(reportRowsToAggregateRows(rows), meta, {
    bom: true,
    trailer: true,
  });
  const lines = csv.text.slice(1).split("\r\n");

  it("starts with the BOM and the watermark; explicit scope ids, never ALL", () => {
    expect(csv.text.startsWith(CSV_BOM)).toBe(true);
    expect(csv.text.charCodeAt(0)).toBe(0xfeff);
    expect(lines[0]).toBe(CSV_WATERMARK);
    expect(lines).toContain("# scope_districts=dist-alpha");
    expect(lines).toContain("# scope_facilities=fac-alpha-1;fac-alpha-2");
  });

  it("ends with the trailer: row count, suppressed cells and SHA-256 of the data rows", () => {
    const header = lines.indexOf(REPORT_CSV_COLUMNS.join(","));
    const data = lines.slice(header + 1, header + 1 + rows.length);
    expect(csv.rowCount).toBe(4);
    expect(csv.suppressedCells).toBe(2);
    expect(csv.sha256).toBe(sha256Hex(data.join("\r\n")));
    expect(lines.at(-2)).toBe(`# END rows=4 suppressed_cells=2 sha256=${csv.sha256}`);
    expect(lines.at(-1)).toBe("");
    expect(data[1]).toContain(",followUpCompleted,Label followUpCompleted,,true,,,demo-metrics-1");
  });

  it("zero rows: metadata, header and a trailer with rows=0", () => {
    const empty = buildAggregateCsv(reportRowsToAggregateRows([]), meta, { trailer: true });
    expect(empty.rowCount).toBe(0);
    expect(empty.text.split("\r\n").at(-2)).toBe(
      `# END rows=0 suppressed_cells=0 sha256=${sha256Hex("")}`,
    );
  });

  it("derives a missing `suppressed` flag from SuppressedNumber cells", () => {
    const out = buildAggregateCsv(
      {
        columns: ["metric_id", "value", "suppressed"],
        rows: [
          ["a", { value: null, suppressed: true, reason: "PRIMARY" }, null],
          ["b", { value: 9, suppressed: false }, undefined],
        ],
      },
      meta,
    );
    expect(out.text).toContain("a,,true\r\nb,9,false\r\n");
    expect(out.suppressedCells).toBe(1);
  });
});

describe("assertAggregateOnly", () => {
  const rows = buildReportRows(template, sections, options);
  const seed = createSeed();
  const patient = seed.patients[0]!;

  it("accepts aggregate report rows", () => {
    expect(() => assertReportAggregateOnly(rows)).not.toThrow();
  });

  it("rejects a seeded synthetic identifier, a uuid or an injected patient name in any cell", () => {
    const bad = (patch: Record<string, unknown>) => [{ ...rows[0]!, ...patch }];
    expect(() => assertAggregateOnly(bad({ metric_label: patient.syntheticIdentifier }))).toThrow(
      AggregateOnlyError,
    );
    expect(() => assertAggregateOnly(bad({ facility_label: ADMIN_DUPLICATE_IDENTIFIER }))).toThrow(
      /synthetic_identifier/,
    );
    expect(() => assertAggregateOnly(bad({ district_id: patient.id }))).toThrow(/uuid/);
    expect(() =>
      assertAggregateOnly(bad({ metric_label: `Visits of ${patient.displayName}` }), {
        forbiddenValues: seed.patients.map((p) => p.displayName),
      }),
    ).toThrow(/forbidden_value/);
  });

  it("rejects a row key outside the allowed set (and denylisted patient columns)", () => {
    expect(() => assertAggregateOnly([{ ...rows[0]!, patient_id: "x" }])).toThrow(
      /column patient_id/,
    );
    expect(() => assertAggregateOnly([{ ...rows[0]!, note: "x" }])).toThrow(AggregateOnlyError);
    expect(() =>
      assertAggregateOnly([{ metric_id: "a", displayName: "x" }], {
        allowedColumns: ["metric_id", "displayName"],
      }),
    ).toThrow(AggregateOnlyError);
  });
});

describe("sha256Hex", () => {
  it.each([
    ["", "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855"],
    ["abc", "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad"],
    [
      "abcdbcdecdefdefgefghfghighijhijkijkljklmklmnlmnomnopnopq",
      "248d6a61d20638b8e5c026930c3e6039a33ce45964ff2167f6ecedd419db06c1",
    ],
  ])("sha256(%j)", (input, hex) => {
    expect(sha256Hex(input)).toBe(hex);
  });

  it("hashes UTF-8 (em dash, apostrophes) and padding / multi-block boundaries", () => {
    expect(sha256Hex("Raporo — Igeragezwa ry'imibare")).toBe(
      "5f79cc9fad9bc06f1d577bb6f14bb966047803820ebe4fda30ca96166c8f5745",
    );
    expect(sha256Hex("x".repeat(55))).toBe(
      "d5e285683cd4efc02d021a5c62014694958901005d6f71e89e0989fac77e4072",
    );
    expect(sha256Hex("x".repeat(64))).toBe(
      "7ce100971f64e7001e8fe5a51973ecdfe1ced42befe7ee8d5fd6219506b5393c",
    );
    expect(sha256Hex("a".repeat(1000))).toBe(
      "41edece42d63e8d9bf515a9ba6932e1c20cbc9f5a5d134645adb5db1b9737ea3",
    );
  });
});
