/**
 * Aggregate CSV (FND-06 task 12) — the ONLY aggregate CSV builder. ADM-07 extends this file
 * (UTF-8 BOM, `# END` trailer with a SHA-256 of the data rows, `assertAggregateOnly`, the
 * `Synthetic demonstration data` and `suppression_policy` lines, a derived `suppressed` flag for
 * generic rows); CLN-10's audit export reuses the low-level `escapeCsvCell` / `toCsvRows` (not
 * aggregate, so no denylist there).
 *
 * Layout: [BOM] line 1 `CSV_WATERMARK`, line 2 its Kinyarwanda translation, line 3
 * `# Synthetic demonstration data`, then `# key=value` metadata lines, then the header and data
 * rows, then (ADM-07 option) `# END rows=<n> suppressed_cells=<m> sha256=<hex>`. RFC 4180
 * quoting, CRLF line endings. Header labels are English machine names (decision: exports are
 * English for data portability); label COLUMNS may carry the UI language.
 */
import type { Role } from "@laif/domain";

import { KIGALI_UTC_OFFSET_MS } from "./filters.ts";
import { sha256Hex } from "./sha256.ts";
import type { SuppressedNumber, SuppressedTable } from "./suppression.ts";
import { METRIC_VERSION } from "./types.ts";

export const CSV_WATERMARK =
  "# DEMONSTRATION — SYNTHETIC PATIENT DATA — NOT FOR CLINICAL USE" as const;
/** RW translation line (same text as `demo:banner` RW; needs linguistic review). */
export const CSV_WATERMARK_RW =
  "# IGERAGEZA — AMAKURU Y'ABARWAYI B'IKITEGEREREZO — NTIBIKORESHWA MU BUVUZI" as const;

/** Line 3 (spec §10): every aggregate file says it is synthetic demonstration data. */
export const CSV_SYNTHETIC_LINE = "# Synthetic demonstration data" as const;

/** UTF-8 byte-order mark, so spreadsheet apps decode Kinyarwanda diacritics correctly. */
export const CSV_BOM = String.fromCharCode(0xfeff);

/** Small-cell policy stamp: the demo threshold is not an approved disclosure policy. */
export const DEMO_SUPPRESSION_POLICY = "DEMO_NOT_APPROVED" as const;

const CRLF = "\r\n";

/** Patient-level columns that an aggregate export must never carry (compared normalised). */
export const PATIENT_LEVEL_COLUMN_DENYLIST = [
  "displayName",
  "patientId",
  "syntheticIdentifier",
  "dateOfBirth",
] as const;

const normalise = (name: string): string => name.toLowerCase().replace(/[^a-z0-9]/g, "");
const DENY = new Set<string>(PATIENT_LEVEL_COLUMN_DENYLIST.map(normalise));

export class PatientLevelExportError extends Error {
  readonly columns: string[];
  constructor(columns: string[]) {
    super(`aggregate CSV must not contain patient-level columns: ${columns.join(", ")}`);
    this.name = "PatientLevelExportError";
    this.columns = columns;
  }
}

/** Throws when any name is denylisted (`patient_id`, `PatientID`, `display name` … all match). */
export function assertNoPatientLevelColumns(names: readonly string[]): void {
  const bad = names.filter((n) => DENY.has(normalise(n)));
  if (bad.length > 0) throw new PatientLevelExportError(bad);
}

export type CsvCell = string | number | boolean | null | undefined;

const INJECTION_PREFIX = /^[=+\-@\t\r]/;

/**
 * One RFC 4180 field. Strings starting with `= + - @ TAB CR` are prefixed with `'` (CSV-injection
 * guard); fields containing `,`, `"`, CR or LF are quoted with `"` doubled. Numbers / booleans
 * are written verbatim; null / undefined → empty.
 */
export function escapeCsvCell(value: CsvCell): string {
  if (value === null || value === undefined) return "";
  if (typeof value === "number") {
    if (!Number.isFinite(value)) throw new RangeError(`non-finite number in CSV: ${value}`);
    return String(value);
  }
  if (typeof value === "boolean") return value ? "true" : "false";
  const guarded = INJECTION_PREFIX.test(value) ? `'${value}` : value;
  return /[",\r\n]/.test(guarded) ? `"${guarded.replace(/"/g, '""')}"` : guarded;
}

/** Rows → CSV text (CRLF between rows, no trailing line break). */
export function toCsvRows(rows: ReadonlyArray<readonly CsvCell[]>): string {
  return rows.map((row) => row.map(escapeCsvCell).join(",")).join(CRLF);
}

/** `2026-10-14T08:00:00+02:00` — an instant in Africa/Kigali local time. */
export function formatKigaliTimestamp(instant: Date): string {
  return `${new Date(instant.getTime() + KIGALI_UTC_OFFSET_MS).toISOString().slice(0, 19)}+02:00`;
}

export type AggregateCsvMeta = {
  exportId: string;
  /** Demo-clock instant; written in Africa/Kigali time. */
  generatedAt: Date;
  generatedByPersonaId: string;
  generatedByRole: Role;
  /** Empty list = every district / facility in the persona's scope (`ALL`). */
  scope: { districtIds: readonly string[]; facilityIds: readonly string[] };
  /** Kigali calendar days `YYYY-MM-DD`. */
  period: { from: string; to: string };
  template: string;
  granularity: string;
  suppressionThreshold: number;
  /** Defaults to `DEMO_SUPPRESSION_POLICY`. */
  suppressionPolicy?: string;
  rulesetVersions: readonly string[];
  /** Defaults to `METRIC_VERSION`. */
  metricVersion?: string;
  reasonCode: string;
};

/** The metadata keys, in file order. */
export const CSV_META_KEYS = [
  "export_id",
  "generated_at",
  "generated_by_persona",
  "role",
  "scope_districts",
  "scope_facilities",
  "period",
  "template",
  "granularity",
  "suppression_threshold",
  "suppression_policy",
  "ruleset_versions",
  "metric_version",
  "reason_code",
] as const;

const metaValue = (value: string): string => value.replace(/[\r\n]+/g, " ").trim();
const list = (values: readonly string[]): string =>
  values.length === 0 ? "ALL" : values.join(";");

export function csvMetadataLines(meta: AggregateCsvMeta): string[] {
  const values: Record<(typeof CSV_META_KEYS)[number], string> = {
    export_id: meta.exportId,
    generated_at: formatKigaliTimestamp(meta.generatedAt),
    generated_by_persona: meta.generatedByPersonaId,
    role: meta.generatedByRole,
    scope_districts: list(meta.scope.districtIds),
    scope_facilities: list(meta.scope.facilityIds),
    period: `${meta.period.from}/${meta.period.to}`,
    template: meta.template,
    granularity: meta.granularity,
    suppression_threshold: String(meta.suppressionThreshold),
    suppression_policy: meta.suppressionPolicy ?? DEMO_SUPPRESSION_POLICY,
    ruleset_versions: list(meta.rulesetVersions),
    metric_version: meta.metricVersion ?? METRIC_VERSION,
    reason_code: meta.reasonCode,
  };
  return CSV_META_KEYS.map((k) => `# ${k}=${metaValue(values[k])}`);
}

export type AggregateCsvValue = CsvCell | SuppressedNumber;

/**
 * Generic aggregate rows (ADM-07 report templates). A `SuppressedNumber` renders its value (empty
 * when suppressed). With a `suppressed` column, a row whose `suppressed` cell is null / undefined
 * gets it derived: `true` when any `SuppressedNumber` of the row is suppressed.
 */
export type AggregateRows = {
  columns: readonly string[];
  rows: ReadonlyArray<readonly AggregateCsvValue[]>;
};

/** Long-format header used for a `SuppressedTable`. */
export const TABLE_CSV_COLUMNS = [
  "row_dimension",
  "row_id",
  "column_dimension",
  "column_id",
  "value",
  "suppressed",
  "suppression_reason",
] as const;
export const CSV_TOTAL_KEY = "TOTAL" as const;

const isSuppressedNumber = (v: AggregateCsvValue): v is SuppressedNumber =>
  typeof v === "object" && v !== null && "suppressed" in v;

const plain = (v: AggregateCsvValue): CsvCell =>
  isSuppressedNumber(v) ? (v.suppressed ? null : v.value) : v;

function tableRows(table: SuppressedTable): AggregateRows {
  const rows: AggregateCsvValue[][] = [];
  const push = (rowId: string, columnId: string, cell: SuppressedNumber): void => {
    rows.push([
      table.rowDimension,
      rowId,
      table.columnDimension,
      columnId,
      cell.suppressed ? null : cell.value,
      cell.suppressed,
      cell.suppressed ? (cell.reason ?? "PRIMARY") : null,
    ]);
  };
  table.rowKeys.forEach((rowKey, r) => {
    table.columnKeys.forEach((colKey, c) =>
      push(rowKey, colKey, table.cells[r]?.[c] as SuppressedNumber),
    );
    const rowTotal = table.rowTotals?.[r];
    if (rowTotal) push(rowKey, CSV_TOTAL_KEY, rowTotal);
  });
  table.columnTotals?.forEach((total, c) =>
    push(CSV_TOTAL_KEY, table.columnKeys[c] as string, total),
  );
  if (table.grandTotal) push(CSV_TOTAL_KEY, CSV_TOTAL_KEY, table.grandTotal);
  return { columns: TABLE_CSV_COLUMNS, rows };
}

const isTable = (input: SuppressedTable | AggregateRows): input is SuppressedTable =>
  "cells" in input;

export type AggregateCsvOptions = {
  /** Prefix the UTF-8 BOM (ADM-07 downloads: on). */
  bom?: boolean;
  /** Append `# END rows=<n> suppressed_cells=<m> sha256=<hex>` (ADM-07 downloads: on). */
  trailer?: boolean;
};

export type AggregateCsv = {
  /** The file content. */
  text: string;
  /** Data rows (header excluded). */
  rowCount: number;
  /** Suppressed cells: rows with `suppressed=true` (or suppressed `SuppressedNumber`s). */
  suppressedCells: number;
  /** SHA-256 (hex) of the data rows: their CSV lines joined with CRLF, no header, no trailer. */
  sha256: string;
};

/** The `# END …` trailer line. */
export function csvTrailerLine(rowCount: number, suppressedCells: number, sha256: string): string {
  return `# END rows=${rowCount} suppressed_cells=${suppressedCells} sha256=${sha256}`;
}

function withSuppressedFlag(data: AggregateRows): {
  rows: CsvCell[][];
  suppressedCells: number;
} {
  const flag = data.columns.indexOf("suppressed");
  let suppressedCells = 0;
  const rows = data.rows.map((row) => {
    const hidden = row.filter((v) => isSuppressedNumber(v) && v.suppressed).length;
    const out = row.map(plain);
    if (flag === -1) {
      suppressedCells += hidden;
      return out;
    }
    if (out[flag] === null || out[flag] === undefined) out[flag] = hidden > 0;
    if (out[flag] === true) suppressedCells += 1;
    return out;
  });
  return { rows, suppressedCells };
}

/**
 * Builds the watermarked aggregate CSV (+ its row / suppressed counts and checksum). Throws
 * `PatientLevelExportError` if any column (or, for a table, a dimension or row/column key) is a
 * denylisted patient-level name, and `RangeError` on a row / header length mismatch.
 */
export function buildAggregateCsv(
  input: SuppressedTable | AggregateRows,
  meta: AggregateCsvMeta,
  options: AggregateCsvOptions = {},
): AggregateCsv {
  if (isTable(input)) {
    assertNoPatientLevelColumns([
      input.rowDimension,
      input.columnDimension,
      ...input.rowKeys,
      ...input.columnKeys,
    ]);
  }
  const data = isTable(input) ? tableRows(input) : input;
  assertNoPatientLevelColumns(data.columns);
  for (const row of data.rows) {
    if (row.length !== data.columns.length) {
      throw new RangeError(`row has ${row.length} cells, header has ${data.columns.length}`);
    }
  }
  const { rows, suppressedCells } = withSuppressedFlag(data);
  const body = toCsvRows(rows);
  const sha256 = sha256Hex(body);
  const lines = [
    CSV_WATERMARK,
    CSV_WATERMARK_RW,
    CSV_SYNTHETIC_LINE,
    ...csvMetadataLines(meta),
    toCsvRows([data.columns]),
    ...(rows.length === 0 ? [] : [body]),
    ...(options.trailer === true ? [csvTrailerLine(rows.length, suppressedCells, sha256)] : []),
  ];
  const text = (options.bom === true ? CSV_BOM : "") + lines.join(CRLF) + CRLF;
  return { text, rowCount: rows.length, suppressedCells, sha256 };
}

/** The CSV text only (`buildAggregateCsv(…).text`). */
export function toAggregateCsv(
  input: SuppressedTable | AggregateRows,
  meta: AggregateCsvMeta,
  options: AggregateCsvOptions = {},
): string {
  return buildAggregateCsv(input, meta, options).text;
}

// ── Aggregate-only guard (ADM-07 task 3) ─────────────────────────────────────

/** The fixed column order of an ADM-07 report CSV. */
export const REPORT_CSV_COLUMNS = [
  "period_start",
  "period_end",
  "granularity",
  "district_id",
  "district_label",
  "facility_id",
  "facility_label",
  "week_start",
  "metric_id",
  "metric_label",
  "value",
  "suppressed",
  "numerator",
  "denominator",
  "metric_version",
] as const;
export type ReportCsvColumn = (typeof REPORT_CSV_COLUMNS)[number];

/** Seed synthetic identifiers (`DEMO-P-0001`, `DEMO-A-0023`, `DEMO-C-0005`, `DEMO-FX-01`). */
export const SYNTHETIC_IDENTIFIER_PATTERN = /\bDEMO-[A-Z]{1,3}-[0-9A-Za-z]{2,}\b/;
/** Any UUID (v4 runtime ids and the seed's deterministic record ids). */
export const UUID_PATTERN = /\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/i;

export type AggregateOnlyViolation =
  | { kind: "column"; column: string }
  | { kind: "value"; column: string; rule: "synthetic_identifier" | "uuid" | "forbidden_value" };

export class AggregateOnlyError extends Error {
  readonly violations: AggregateOnlyViolation[];
  constructor(violations: AggregateOnlyViolation[]) {
    super(
      `aggregate export rejected: ${violations
        .map((v) => (v.kind === "column" ? `column ${v.column}` : `${v.rule} in ${v.column}`))
        .join(", ")}`,
    );
    this.name = "AggregateOnlyError";
    this.violations = violations;
  }
}

export type AssertAggregateOnlyOptions = {
  /** Allowed row keys (default `REPORT_CSV_COLUMNS`). */
  allowedColumns?: readonly string[];
  /** Exact strings that must never appear in a cell (e.g. seeded patient display names). */
  forbiddenValues?: readonly string[];
};

/**
 * "No patient-level export" enforced in code (ADM-07 task 3): throws `AggregateOnlyError` when a
 * row has a key outside the allowed column set (or a denylisted patient-level column), or a
 * string cell contains a seed synthetic identifier, a UUID or a forbidden value. Runs on every
 * export, before the CSV is built.
 */
export function assertAggregateOnly(
  rows: ReadonlyArray<Readonly<Record<string, unknown>>>,
  options: AssertAggregateOnlyOptions = {},
): void {
  const allowed = new Set(options.allowedColumns ?? REPORT_CSV_COLUMNS);
  const forbidden = (options.forbiddenValues ?? []).map((v) => v.trim()).filter((v) => v !== "");
  const violations: AggregateOnlyViolation[] = [];
  const seen = new Set<string>();
  const add = (v: AggregateOnlyViolation): void => {
    const id = JSON.stringify(v);
    if (seen.has(id)) return;
    seen.add(id);
    violations.push(v);
  };
  for (const row of rows) {
    for (const [column, value] of Object.entries(row)) {
      if (!allowed.has(column) || DENY.has(normalise(column))) add({ kind: "column", column });
      if (typeof value !== "string") continue;
      if (SYNTHETIC_IDENTIFIER_PATTERN.test(value)) {
        add({ kind: "value", column, rule: "synthetic_identifier" });
      }
      if (UUID_PATTERN.test(value)) add({ kind: "value", column, rule: "uuid" });
      if (forbidden.some((f) => value.includes(f))) {
        add({ kind: "value", column, rule: "forbidden_value" });
      }
    }
  }
  if (violations.length > 0) throw new AggregateOnlyError(violations);
}
