/**
 * Preview of the aggregate report (ADM-07 step 2): exactly the rows the CSV will contain, with
 * suppressed cells shown as `<k` (or "Hidden" for complementary / derived suppression, as on the
 * dashboard pages) plus a legend, the row count and the suppressed-cell count.
 */
import type { AggregateCell, ReportRow, SuppressionReason } from "@laif/analytics";
import { formatDate, formatNumber, useLanguage } from "@laif/i18n";
import { AccessibleDataTable, useTx, type DataTableColumn } from "@laif/ui-web";

import { SuppressedValue } from "../../components/SuppressedValue.tsx";

export type PreviewRow = { id: string; row: ReportRow; reason: SuppressionReason | null };

const RATE_METRICS = new Set(["overturned_flag_rate", "task_completion_rate"]);

function cellOf(key: string, value: number | null, row: PreviewRow): AggregateCell {
  if (!row.row.suppressed) return { key, value, suppressed: false };
  return { key, value: null, suppressed: true, reason: row.reason ?? "PRIMARY" };
}

export function ReportPreviewTable({
  rows,
  threshold,
}: {
  rows: readonly PreviewRow[];
  threshold: number;
}) {
  const t = useTx();
  const { language } = useLanguage();
  const format = (metricId: string) => (v: number) =>
    RATE_METRICS.has(metricId)
      ? t("admin:reports.preview.pct", {
          pct: formatNumber(v * 100, language, { maximumFractionDigits: 1 }),
        })
      : formatNumber(v, language, { maximumFractionDigits: 1 });
  const part = (p: PreviewRow, which: "numerator" | "denominator") =>
    p.row[which] === null && !p.row.suppressed ? (
      <span className="text-muted">{t("admin:privacy.noValue")}</span>
    ) : (
      <SuppressedValue
        cell={cellOf(which, p.row[which], p)}
        threshold={threshold}
        compact
        emptyText={t("admin:privacy.noValue")}
      />
    );
  const columns: DataTableColumn<PreviewRow>[] = [
    {
      id: "node",
      header: t("admin:reports.preview.col.node"),
      isRowHeader: true,
      cell: (p) =>
        p.row.week_start !== null
          ? t("admin:reports.preview.week", {
              date: formatDate(`${p.row.week_start}T12:00:00.000Z`, language),
            })
          : (p.row.facility_label ?? p.row.district_label ?? t("admin:reports.preview.allScope")),
    },
    {
      id: "metric",
      header: t("admin:reports.preview.col.metric"),
      cell: (p) => (
        <span>
          <span className="text-ink">{p.row.metric_label}</span>
          <span className="text-muted block font-mono text-[11px]">{p.row.metric_id}</span>
        </span>
      ),
    },
    {
      id: "value",
      header: t("admin:reports.preview.col.value"),
      align: "end",
      cell: (p) => (
        <SuppressedValue
          cell={cellOf(p.row.metric_id, p.row.value, p)}
          threshold={threshold}
          format={format(p.row.metric_id)}
          emptyText={t("admin:privacy.noValue")}
        />
      ),
    },
    {
      id: "numerator",
      header: t("admin:reports.preview.col.numerator"),
      align: "end",
      cell: (p) => part(p, "numerator"),
    },
    {
      id: "denominator",
      header: t("admin:reports.preview.col.denominator"),
      align: "end",
      cell: (p) => part(p, "denominator"),
    },
  ];
  return (
    <AccessibleDataTable
      scrollable
      caption={t("admin:reports.preview.caption")}
      columns={columns}
      rows={rows}
      getRowId={(p) => p.id}
      className="max-h-[520px] overflow-auto"
    />
  );
}
