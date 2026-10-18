/**
 * Export history (ADM-07 task 9): the persona's own export attempts (and, for governance roles,
 * every export inside the grant) — time, persona / role, template, scope, period, reason, rows,
 * suppressed cells, checksum (first 12 characters) and a `GENERATED` / `DENIED` pill. Denied
 * attempts are listed too, so access reports include failures.
 */
import { roleLabelKey } from "@laif/auth-demo";
import type { ExportAudit } from "@laif/contracts";
import { formatDate, formatDateTime, formatNumber, useLanguage } from "@laif/i18n";
import {
  AccessibleDataTable,
  Card,
  EmptyState,
  ErrorState,
  errorCodeOf,
  LoadingSkeleton,
  StatusChip,
  useTx,
  type DataTableColumn,
  type TranslationKey,
} from "@laif/ui-web";

import { districtLabel, facilityLabel } from "../../app/persona-labels.ts";
import { findAdminPersona } from "../../auth/personas.ts";
import { useExportHistory } from "./queries.ts";

export function ExportHistoryTable() {
  const t = useTx();
  const { language } = useLanguage();
  const query = useExportHistory();
  const day = (iso: string) => formatDate(`${iso}T12:00:00.000Z`, language);

  const columns: DataTableColumn<ExportAudit>[] = [
    {
      id: "time",
      header: t("admin:reports.history.col.time"),
      isRowHeader: true,
      sortValue: (r) => r.createdAt,
      cell: (r) => formatDateTime(r.createdAt, language),
    },
    {
      id: "persona",
      header: t("admin:reports.history.col.persona"),
      cell: (r) => (
        <span>
          <span className="text-ink block">
            {findAdminPersona(r.actorId)?.displayName ?? r.actorId ?? "—"}
          </span>
          <span className="text-muted block text-xs">
            {r.role === null ? "" : t(roleLabelKey(r.role))}
          </span>
        </span>
      ),
    },
    {
      id: "template",
      header: t("admin:reports.history.col.template"),
      cell: (r) => t(`admin:reports.template.${r.template}.name` as TranslationKey),
    },
    {
      id: "scope",
      header: t("admin:reports.history.col.scope"),
      cell: (r) =>
        [
          ...r.scope.districtIds.map((id) => districtLabel(id, t)),
          ...r.scope.facilityIds.map((id) => facilityLabel(id, t)),
        ].join(", ") || t("admin:reports.preview.allScope"),
    },
    {
      id: "period",
      header: t("admin:reports.history.col.period"),
      cell: (r) =>
        r.period === null
          ? "—"
          : t("admin:reports.history.period", { from: day(r.period.from), to: day(r.period.to) }),
    },
    {
      id: "reason",
      header: t("admin:reports.history.col.reason"),
      cell: (r) => t(`admin:reports.reason.code.${r.reasonCode}` as TranslationKey),
    },
    {
      id: "rows",
      header: t("admin:reports.history.col.rows"),
      align: "end",
      sortValue: (r) => r.rowCount,
      cell: (r) => formatNumber(r.rowCount, language),
    },
    {
      id: "suppressed",
      header: t("admin:reports.history.col.suppressed"),
      align: "end",
      cell: (r) => formatNumber(r.suppressedCells, language),
    },
    {
      id: "checksum",
      header: t("admin:reports.history.col.checksum"),
      cell: (r) =>
        r.sha256 === null ? (
          "—"
        ) : (
          <span className="font-mono text-xs" title={r.sha256}>
            {r.sha256.slice(0, 12)}
          </span>
        ),
    },
    {
      id: "status",
      header: t("admin:reports.history.col.status"),
      cell: (r) => (
        <StatusChip tone={r.status === "generated" ? "positive" : "danger"}>
          {t(`admin:reports.history.status.${r.status}` as TranslationKey)}
        </StatusChip>
      ),
    },
  ];

  return (
    <div data-testid="export-history">
      <Card title={t("admin:reports.history.title")}>
        <p className="text-muted mt-0 mb-3 text-xs">{t("admin:reports.history.subtitle")}</p>
        {query.isPending ? (
          <LoadingSkeleton variant="table" lines={3} />
        ) : query.isError ? (
          <ErrorState
            code={errorCodeOf(query.error) ?? "INTERNAL"}
            message={t("admin:reports.history.error")}
            onRetry={() => query.refetch()}
          />
        ) : (
          <AccessibleDataTable
            caption={t("admin:reports.history.caption")}
            captionHidden
            columns={columns}
            rows={query.data}
            getRowId={(r) => r.id}
            defaultSort={{ columnId: "time", direction: "descending" }}
            emptyState={
              <EmptyState
                icon="file"
                title={t("admin:reports.history.emptyTitle")}
                description={t("admin:reports.history.empty")}
              />
            }
          />
        )}
      </Card>
    </div>
  );
}
