/**
 * Report rows and the export CSV (ADM-07 tasks 2–5) over the single `@laif/analytics` code path:
 * `buildReportRows` (format the selector cells; suppressed → blank + `suppressed=true`) →
 * `assertReportAggregateOnly` (no patient-level column or identifier, every time) →
 * `buildAggregateCsv` with the UTF-8 BOM and the `# END rows=… suppressed_cells=… sha256=…`
 * trailer. Label columns follow the UI language; `metric_id` stays the stable English id; the
 * watermark and metadata lines stay English (machine checks) + the RW watermark line.
 */
import {
  buildAggregateCsv,
  buildReportRows,
  assertReportAggregateOnly,
  reportRowsToAggregateRows,
  type AggregateCsv,
  type ReportLabels,
  type ReportRow,
} from "@laif/analytics";
import type { Role } from "@laif/domain";
import type { TranslationKey } from "@laif/ui-web";

import { districtLabel, facilityLabel, type Tx } from "../../app/persona-labels.ts";
import type { ReportData } from "./queries.ts";
import { reportTemplate } from "./templates.ts";

/** Translated label of a report metric id (`admin:reports.metric.*`). */
export function metricLabel(id: string, t: Tx): string {
  const parts = id.split(".");
  const [head, a, b, c] = parts;
  if (head === "missing_field" && a !== undefined) {
    return t("admin:reports.metric.missing_field", {
      field: t(`admin:quality.field.${a}` as TranslationKey),
    });
  }
  if (head === "pending_reviews" && a !== undefined) {
    return t("admin:reports.metric.pending_reviews", {
      bucket: t(`admin:timeliness.aging.bucket.${a}` as TranslationKey),
    });
  }
  if (head === "funnel" && a !== undefined) {
    return t("admin:reports.metric.funnel", {
      stage:
        a === "dismissed"
          ? t("admin:reports.metric.dismissed")
          : t(`admin:funnel.stage.${a}` as TranslationKey),
    });
  }
  if (head === "fairness" && a !== undefined && b !== undefined && c !== undefined) {
    return t("admin:reports.metric.fairness", {
      group: t(`admin:quality.fairness.${a}.${b}` as TranslationKey),
      column: t(`admin:quality.fairness.column.${c}` as TranslationKey),
    });
  }
  return t(`admin:reports.metric.${id}` as TranslationKey);
}

export function reportLabels(t: Tx): ReportLabels {
  return {
    district: (id) => districtLabel(id, t),
    facility: (id) => facilityLabel(id, t),
    metric: (id) => metricLabel(id, t),
  };
}

/** Report data → rows in the current language (preview and CSV share it). */
export function reportRowsOf(data: ReportData, t: Tx): ReportRow[] {
  return buildReportRows(reportTemplate(data.template), data.sections, {
    period: data.period,
    granularity: data.granularity,
    labels: reportLabels(t),
  });
}

/** `laif-demo_<template>_<scope>_<from>_<to>_<exportId8>.csv` */
export function exportFileName(data: ReportData, exportId: string, scopeSlug: string): string {
  const id8 = exportId.replace(/-/g, "").slice(0, 8).toLowerCase();
  const slug = scopeSlug.replace(/[^A-Za-z0-9_-]/g, "-") || "scope";
  return `laif-demo_${data.template}_${slug}_${data.period.from}_${data.period.to}_${id8}.csv`;
}

/** Scope part of the file name: the filtered facility / district, the single district, or `all`. */
export function scopeSlugOf(
  view: { district: string | null; facility: string | null },
  data: Pick<ReportData, "districtIds" | "facilityIds">,
): string {
  if (view.facility !== null) return view.facility;
  if (view.district !== null) return view.district;
  if (data.districtIds.length === 1) return data.districtIds[0] ?? "all";
  if (data.districtIds.length === 0 && data.facilityIds.length === 1) {
    return data.facilityIds[0] ?? "all";
  }
  return "all";
}

export type ExportCsvMeta = {
  exportId: string;
  generatedAt: Date;
  personaId: string;
  role: Role;
  reasonCode: string;
  /** Seeded patient display names known to the client (guard), if any. */
  forbiddenValues?: readonly string[];
};

export type ExportCsv = AggregateCsv & { rows: ReportRow[]; fileName: string };

export function buildExportCsv(
  data: ReportData,
  view: { district: string | null; facility: string | null },
  t: Tx,
  meta: ExportCsvMeta,
): ExportCsv {
  const rows = reportRowsOf(data, t);
  assertReportAggregateOnly(rows, { forbiddenValues: meta.forbiddenValues ?? [] });
  const csv = buildAggregateCsv(
    reportRowsToAggregateRows(rows),
    {
      exportId: meta.exportId,
      generatedAt: meta.generatedAt,
      generatedByPersonaId: meta.personaId,
      generatedByRole: meta.role,
      scope: { districtIds: data.districtIds, facilityIds: data.facilityIds },
      period: data.period,
      template: data.template,
      granularity: data.granularity,
      suppressionThreshold: data.threshold,
      rulesetVersions: data.rulesetVersions,
      reasonCode: meta.reasonCode,
    },
    { bom: true, trailer: true },
  );
  return {
    ...csv,
    rows,
    fileName: exportFileName(data, meta.exportId, scopeSlugOf(view, data)),
  };
}

/** Browser download: Blob + temporary anchor, object URL revoked after the click. */
export function downloadCsv(text: string, fileName: string): void {
  const blob = new Blob([text], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = fileName;
  anchor.rel = "noopener";
  anchor.style.display = "none";
  document.body.appendChild(anchor);
  try {
    anchor.click();
  } finally {
    anchor.remove();
    // Revoke on the next task: some browsers start the download asynchronously.
    setTimeout(() => URL.revokeObjectURL(url), 0);
  }
}
