import { createDemoClock } from "@laif/domain";
import { createSeed, DEMO_SMALL_CELL_THRESHOLD, PERSONA_IDS } from "@laif/mock-data";
import { describe, expect, it } from "vitest";

import {
  CSV_META_KEYS,
  CSV_WATERMARK,
  CSV_WATERMARK_RW,
  escapeCsvCell,
  formatKigaliTimestamp,
  PatientLevelExportError,
  PATIENT_LEVEL_COLUMN_DENYLIST,
  TABLE_CSV_COLUMNS,
  toAggregateCsv,
  toCsvRows,
  type AggregateCsvMeta,
} from "./csv.ts";
import { metricTable } from "./metrics/programme.ts";
import { suppressCells } from "./suppression.ts";

const seed = createSeed();
const now = createDemoClock().now();

const meta: AggregateCsvMeta = {
  exportId: "exp-0001",
  generatedAt: now,
  generatedByPersonaId: PERSONA_IDS.leadProgramme,
  generatedByRole: "programme_lead",
  scope: { districtIds: ["dist-alpha", "dist-beta"], facilityIds: [] },
  period: { from: "2026-07-16", to: "2026-10-14" },
  template: "follow_up_summary",
  granularity: "district",
  suppressionThreshold: DEMO_SMALL_CELL_THRESHOLD,
  rulesetVersions: ["demo-ruleset-2026.10-v1"],
  reasonCode: "programme_review",
};

const table = suppressCells(
  metricTable(seed, {}, now, {
    groupBy: "district",
    metricKeys: ["screenings_recorded", "follow_ups_completed"],
  }),
);

describe("toAggregateCsv", () => {
  const csv = toAggregateCsv(table, meta);
  const lines = csv.split("\r\n");

  it("starts with the watermark line, then the RW line and the metadata block", () => {
    expect(lines[0]).toBe(CSV_WATERMARK);
    expect(lines[0]).toBe("# DEMONSTRATION — SYNTHETIC PATIENT DATA — NOT FOR CLINICAL USE");
    expect(lines[1]).toBe(CSV_WATERMARK_RW);
    expect(lines[2]).toBe("# Synthetic demonstration data");
    expect(lines.slice(3, 3 + CSV_META_KEYS.length)).toEqual([
      "# export_id=exp-0001",
      "# generated_at=2026-10-14T08:00:00+02:00",
      "# generated_by_persona=persona-lead-programme",
      "# role=programme_lead",
      "# scope_districts=dist-alpha;dist-beta",
      "# scope_facilities=ALL",
      "# period=2026-07-16/2026-10-14",
      "# template=follow_up_summary",
      "# granularity=district",
      "# suppression_threshold=5",
      "# suppression_policy=DEMO_NOT_APPROVED",
      "# ruleset_versions=demo-ruleset-2026.10-v1",
      "# metric_version=demo-metrics-1",
      "# reason_code=programme_review",
    ]);
    expect(csv.endsWith("\r\n")).toBe(true);
  });

  it("writes suppressed cells empty with suppressed=true (long format, totals included)", () => {
    const body = lines.slice(3 + CSV_META_KEYS.length).filter((l) => l !== "");
    expect(body[0]).toBe(TABLE_CSV_COLUMNS.join(","));
    expect(body.slice(1)).toEqual([
      "district_id,dist-alpha,metric_id,screenings_recorded,40,false,",
      "district_id,dist-alpha,metric_id,follow_ups_completed,,true,COMPLEMENTARY",
      "district_id,dist-beta,metric_id,screenings_recorded,17,false,",
      "district_id,dist-beta,metric_id,follow_ups_completed,,true,PRIMARY",
      "district_id,TOTAL,metric_id,screenings_recorded,57,false,",
      "district_id,TOTAL,metric_id,follow_ups_completed,6,false,",
    ]);
  });

  it("contains no denylisted patient-level column and no patient data", () => {
    for (const name of PATIENT_LEVEL_COLUMN_DENYLIST) expect(csv).not.toContain(name);
    for (const p of seed.patients) {
      expect(csv).not.toContain(p.displayName);
      expect(csv).not.toContain(p.syntheticIdentifier);
    }
  });

  it("throws on denylisted columns in any spelling", () => {
    for (const col of [
      "displayName",
      "patient_id",
      "PatientID",
      "synthetic identifier",
      "date_of_birth",
    ]) {
      expect(() => toAggregateCsv({ columns: ["metric_id", col], rows: [] }, meta)).toThrow(
        PatientLevelExportError,
      );
    }
    expect(() => toAggregateCsv({ ...table, rowDimension: "patientId" }, meta)).toThrow(
      PatientLevelExportError,
    );
  });

  it("accepts generic aggregate rows with SuppressedNumber cells and zero rows", () => {
    const out = toAggregateCsv(
      {
        columns: ["metric_id", "value", "suppressed"],
        rows: [
          ["follow_ups_completed", { value: null, suppressed: true, reason: "PRIMARY" }, true],
          ["screenings_recorded", { value: 57, suppressed: false }, false],
        ],
      },
      meta,
    ).split("\r\n");
    expect(out.slice(-4)).toEqual([
      "metric_id,value,suppressed",
      "follow_ups_completed,,true",
      "screenings_recorded,57,false",
      "",
    ]);
    const empty = toAggregateCsv({ columns: ["metric_id", "value"], rows: [] }, meta);
    expect(empty.split("\r\n")[0]).toBe(CSV_WATERMARK);
    expect(() => toAggregateCsv({ columns: ["metric_id", "value"], rows: [["x"]] }, meta)).toThrow(
      RangeError,
    );
  });

  it("sanitises metadata line breaks (no metadata injection)", () => {
    const out = toAggregateCsv(table, { ...meta, reasonCode: "a\r\n# export_id=forged" });
    expect(out).toContain("# reason_code=a # export_id=forged");
    expect(out.split("\r\n").filter((l) => l.startsWith("# export_id="))).toHaveLength(1);
  });

  it("is deterministic", () => {
    expect(toAggregateCsv(table, meta)).toBe(csv);
  });
});

describe("low-level CSV helpers (shared with CLN-10)", () => {
  it.each([
    [null, ""],
    [undefined, ""],
    [12, "12"],
    [-3, "-3"],
    [true, "true"],
    ["plain", "plain"],
    ["a,b", '"a,b"'],
    ['say "hi"', '"say ""hi"""'],
    ["line\nbreak", '"line\nbreak"'],
    ["=SUM(A1)", "'=SUM(A1)"],
    ["+1", "'+1"],
    ["-1", "'-1"],
    ["@cmd", "'@cmd"],
    ["\tx", "'\tx"],
    ["=a,b", '"\'=a,b"'],
  ] as const)("escapeCsvCell(%j) → %j", (input, expected) => {
    expect(escapeCsvCell(input)).toBe(expected);
  });

  it("rejects non-finite numbers", () => {
    expect(() => escapeCsvCell(Number.POSITIVE_INFINITY)).toThrow(RangeError);
  });

  it("toCsvRows joins with CRLF", () => {
    expect(
      toCsvRows([
        ["a", 1],
        ["b,c", null],
      ]),
    ).toBe('a,1\r\n"b,c",');
  });

  it("formats Kigali timestamps", () => {
    expect(formatKigaliTimestamp(new Date("2026-10-14T22:30:00.000Z"))).toBe(
      "2026-10-15T00:30:00+02:00",
    );
  });
});
