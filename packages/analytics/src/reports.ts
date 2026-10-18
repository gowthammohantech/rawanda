/**
 * Aggregate report rows (ADM-07 task 2): one long-format row per (node, metric) with the fixed
 * column order `REPORT_CSV_COLUMNS`.
 *
 * Values are never recomputed here. A report is built from `ReportSection`s whose cells come
 * from the SAME selectors (and the same scope-wide suppression pass) as the on-screen pages, so a
 * CSV can never reveal a value the dashboard hides: `buildReportRows` only formats those cells.
 * A suppressed cell — or a value whose numerator or denominator is suppressed — is written with
 * `value`, `numerator` and `denominator` empty and `suppressed=true`. `metric_id` values are
 * stable English ids; the label columns carry the UI language.
 */
import type { ExportGranularity } from "@laif/contracts";

import type { AggregateCell } from "./aggregate-cells.ts";
import {
  assertAggregateOnly,
  REPORT_CSV_COLUMNS,
  type AggregateRows,
  type AssertAggregateOnlyOptions,
  type ReportCsvColumn,
} from "./csv.ts";
import { METRIC_VERSION } from "./types.ts";

export const REPORT_COLUMNS = REPORT_CSV_COLUMNS;
export type ReportColumn = ReportCsvColumn;

export type ReportGranularity = ExportGranularity;

export type ReportRow = {
  period_start: string;
  period_end: string;
  granularity: ReportGranularity;
  district_id: string | null;
  district_label: string | null;
  facility_id: string | null;
  facility_label: string | null;
  week_start: string | null;
  metric_id: string;
  metric_label: string;
  value: number | null;
  suppressed: boolean;
  numerator: number | null;
  denominator: number | null;
  metric_version: string;
};

/** Where a section's cells sit: the whole scope, one district, one facility or one week. */
export type ReportNode = {
  granularity: ReportGranularity;
  districtId: string | null;
  facilityId: string | null;
  weekStart: string | null;
};

export type ReportMetricCell = {
  /** Stable English id (must be listed by the template). */
  metricId: string;
  cell: AggregateCell;
  numerator?: AggregateCell;
  denominator?: AggregateCell;
};

export type ReportSection = { node: ReportNode; metrics: readonly ReportMetricCell[] };

export type ReportTemplateSpec = {
  id: string;
  /** Every metric id the template may write (anything else is a programming error). */
  metricIds: readonly string[];
  granularities: readonly ReportGranularity[];
};

export type ReportLabels = {
  district: (id: string) => string;
  facility: (id: string) => string;
  metric: (metricId: string) => string;
};

export type BuildReportOptions = {
  /** Kigali calendar days of the period. */
  period: { from: string; to: string };
  granularity: ReportGranularity;
  labels: ReportLabels;
  metricVersion?: string;
};

const isHidden = (cell: AggregateCell | undefined): boolean => cell?.suppressed === true;

/**
 * Sections → report rows, in section order then metric order. Throws `RangeError` for a
 * granularity the template does not offer, a section of another granularity, or a metric id the
 * template does not list.
 */
export function buildReportRows(
  template: ReportTemplateSpec,
  sections: readonly ReportSection[],
  options: BuildReportOptions,
): ReportRow[] {
  if (!template.granularities.includes(options.granularity)) {
    throw new RangeError(`template ${template.id} has no granularity ${options.granularity}`);
  }
  const allowed = new Set(template.metricIds);
  const rows: ReportRow[] = [];
  for (const { node, metrics } of sections) {
    if (node.granularity !== options.granularity) {
      throw new RangeError(`section granularity ${node.granularity} ≠ ${options.granularity}`);
    }
    for (const m of metrics) {
      if (!allowed.has(m.metricId)) {
        throw new RangeError(`metric ${m.metricId} is not part of template ${template.id}`);
      }
      const suppressed = isHidden(m.cell) || isHidden(m.numerator) || isHidden(m.denominator);
      rows.push({
        period_start: options.period.from,
        period_end: options.period.to,
        granularity: node.granularity,
        district_id: node.districtId,
        district_label: node.districtId === null ? null : options.labels.district(node.districtId),
        facility_id: node.facilityId,
        facility_label: node.facilityId === null ? null : options.labels.facility(node.facilityId),
        week_start: node.weekStart,
        metric_id: m.metricId,
        metric_label: options.labels.metric(m.metricId),
        value: suppressed ? null : m.cell.value,
        suppressed,
        numerator: suppressed ? null : (m.numerator?.value ?? null),
        denominator: suppressed ? null : (m.denominator?.value ?? null),
        metric_version: options.metricVersion ?? METRIC_VERSION,
      });
    }
  }
  return rows;
}

/** Rows with `suppressed=true` (the trailer's `suppressed_cells`). */
export function countSuppressedRows(rows: readonly ReportRow[]): number {
  return rows.filter((r) => r.suppressed).length;
}

/** Report rows → the CSV builder's generic rows (fixed column order). */
export function reportRowsToAggregateRows(rows: readonly ReportRow[]): AggregateRows {
  return {
    columns: REPORT_COLUMNS,
    rows: rows.map((row) => REPORT_COLUMNS.map((c: ReportColumn) => row[c])),
  };
}

/** `assertAggregateOnly` with the report column set (the export service runs it every time). */
export function assertReportAggregateOnly(
  rows: readonly ReportRow[],
  options: Omit<AssertAggregateOnlyOptions, "allowedColumns"> = {},
): void {
  assertAggregateOnly(rows, { ...options, allowedColumns: REPORT_COLUMNS });
}
