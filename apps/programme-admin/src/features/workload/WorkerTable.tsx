/**
 * Per-worker table (ADM-05 task 4–6): pseudonymous worker codes only (never names), sortable by
 * code / assigned / completed with `aria-sort` (keyboard: Enter / Space on the header button).
 * The DEFAULT sort is the worker code — never by performance — and there are no top / bottom
 * badges or red / green colouring: completion is a neutral primary bar, overdue counts use the
 * neutral warning token with icon + text. The facility cell narrows the page to that facility
 * (still ScopeGuard-checked); nothing links to a task or patient.
 */
import type { AggregateCell } from "@laif/analytics";
import { AccessibleDataTable, Icon, ProgressBar, useTx, type DataTableColumn } from "@laif/ui-web";
import { Link } from "react-router";

import { paths } from "../../app/nav.ts";
import { facilityLabel } from "../../app/persona-labels.ts";
import { SuppressedValue, useCellText } from "../../components/SuppressedValue.tsx";
import { serializeAdminFilters, type AdminFilters } from "../filters/filterSchema.ts";
import { useMinutesFormat, usePercentFormat } from "./format.ts";
import type { WorkerRow } from "./selectWorkload.ts";

/** Sort key of a cell: hidden / empty values sort last (never ranked). */
const sortOf = (c: AggregateCell): number | null => (c.suppressed ? null : c.value);

export type WorkerTableProps = {
  rows: readonly WorkerRow[];
  threshold: number;
  filters: AdminFilters;
};

export function WorkerTable({ rows, threshold, filters }: WorkerTableProps) {
  const t = useTx();
  const minutes = useMinutesFormat();
  const pct = usePercentFormat();
  const cellText = useCellText({ short: true });
  const count = (c: AggregateCell) => <SuppressedValue cell={c} threshold={threshold} compact />;
  const codeOf = (r: WorkerRow) => r.workerCode ?? t("admin:workload.table.unlisted");

  const columns: DataTableColumn<WorkerRow>[] = [
    {
      id: "code",
      header: t("admin:workload.table.code"),
      cell: (r) => <span className="font-mono text-[13px]">{codeOf(r)}</span>,
      sortValue: (r) => r.workerCode ?? "~",
      isRowHeader: true,
    },
    {
      id: "facility",
      header: t("admin:workload.table.facility"),
      cell: (r) => (
        <Link
          to={`${paths.workload}${serializeAdminFilters({ ...filters, facility: r.facilityId })}`}
          className="text-primary-dark hover:underline"
          aria-label={t("admin:workload.table.facilityLink", {
            facility: facilityLabel(r.facilityId, t),
          })}
        >
          {facilityLabel(r.facilityId, t)}
        </Link>
      ),
    },
    {
      id: "assigned",
      header: t("admin:workload.table.assigned"),
      align: "end",
      cell: (r) => count(r.assigned),
      sortValue: (r) => sortOf(r.assigned),
    },
    {
      id: "completed",
      header: t("admin:workload.table.completed"),
      align: "end",
      cell: (r) => count(r.completed),
      sortValue: (r) => sortOf(r.completed),
    },
    {
      id: "completion",
      header: t("admin:workload.table.completion"),
      cell: (r) =>
        r.completionRate.suppressed || r.completionRate.value === null ? (
          <SuppressedValue cell={r.completionRate} threshold={threshold} derived compact />
        ) : (
          <div className="flex min-w-[96px] items-center gap-2">
            <ProgressBar
              hideLabel
              value={Math.round(r.completionRate.value * 100)}
              label={t("admin:workload.table.completionOf", { code: codeOf(r) })}
              className="w-16"
            />
            <span className="tabular-nums">{pct(r.completionRate.value)}</span>
          </div>
        ),
    },
    {
      id: "overdue",
      header: t("admin:workload.table.overdue"),
      align: "end",
      cell: (r) =>
        !r.overdue.suppressed && (r.overdue.value ?? 0) > 0 ? (
          <span className="text-risk-warning inline-flex items-center gap-1" data-tone="warning">
            <Icon name="alert" size={12} />
            {t("admin:workload.table.overdueCount", { n: cellText(r.overdue, threshold) })}
          </span>
        ) : (
          count(r.overdue)
        ),
    },
    {
      id: "unableToReach",
      header: t("admin:workload.table.unableToReach"),
      align: "end",
      cell: (r) => count(r.unableToReach),
    },
    {
      id: "minutes",
      header: t("admin:workload.table.minutes"),
      align: "end",
      cell: (r) =>
        r.noContacts ? (
          <span title={t("admin:workload.table.noContacts")} data-testid="no-contacts">
            <span aria-hidden="true">{t("admin:privacy.noValue")}</span>
            <span className="sr-only">{t("admin:workload.table.noContacts")}</span>
          </span>
        ) : (
          <SuppressedValue
            cell={r.minutesPerPatientDay}
            threshold={threshold}
            format={minutes}
            derived
            compact
          />
        ),
    },
  ];

  return (
    <div data-testid="worker-table">
      <AccessibleDataTable
        scrollable
        caption={t("admin:workload.table.caption")}
        columns={columns}
        rows={rows}
        getRowId={(r) => r.key}
        defaultSort={{ columnId: "code", direction: "ascending" }}
        emptyState={t("admin:workload.table.empty")}
      />
    </div>
  );
}
