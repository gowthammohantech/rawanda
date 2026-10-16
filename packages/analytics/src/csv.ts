/**
 * Aggregate CSV (FND-06 task 12) — the ONLY aggregate CSV builder. ADM-07 extends this file
 * (BOM, trailer checksum, `assertAggregateOnly`); CLN-10's audit export reuses the low-level
 * `escapeCsvCell` / `toCsvRows` (not aggregate, so no denylist there).
 *
 * Layout: line 1 `CSV_WATERMARK`, line 2 its Kinyarwanda translation, then `# key=value`
 * metadata lines, then the header and data rows. RFC 4180 quoting, CRLF line endings. Header
 * labels are English machine names (decision: exports are English for data portability).
 */
import type { Role } from "@laif/domain";

import { KIGALI_UTC_OFFSET_MS } from "./filters.ts";
import type { SuppressedNumber, SuppressedTable } from "./suppression.ts";
import { METRIC_VERSION } from "./types.ts";

export const CSV_WATERMARK =
  "# DEMONSTRATION — SYNTHETIC PATIENT DATA — NOT FOR CLINICAL USE" as const;
/** RW translation line (same text as `demo:banner` RW; needs linguistic review). */
export const CSV_WATERMARK_RW =
  "# IGERAGEZA — AMAKURU Y'ABARWAYI B'IKITEGEREREZO — NTIBIKORESHWA MU BUVUZI" as const;

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
    ruleset_versions: list(meta.rulesetVersions),
    metric_version: meta.metricVersion ?? METRIC_VERSION,
    reason_code: meta.reasonCode,
  };
  return CSV_META_KEYS.map((k) => `# ${k}=${metaValue(values[k])}`);
}

export type AggregateCsvValue = CsvCell | SuppressedNumber;

/** Generic aggregate rows (ADM-07 report templates). A `SuppressedNumber` renders its value. */
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

/**
 * Builds the watermarked aggregate CSV. Throws `PatientLevelExportError` if any column (or, for a
 * table, a dimension or row/column key) is a denylisted patient-level name.
 */
export function toAggregateCsv(
  input: SuppressedTable | AggregateRows,
  meta: AggregateCsvMeta,
): string {
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
  const lines = [
    CSV_WATERMARK,
    CSV_WATERMARK_RW,
    ...csvMetadataLines(meta),
    toCsvRows([data.columns, ...data.rows.map((r) => r.map(plain))]),
  ];
  return lines.join(CRLF) + CRLF;
}
