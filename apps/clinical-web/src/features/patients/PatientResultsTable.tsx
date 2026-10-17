/**
 * Results table (CLN-03 task 4): `AccessibleDataTable` with SYNTHETIC ID · NAME · AGE/SEX ·
 * FACILITY · LAST SCREENING · OPEN ITEMS. The name cell is a link to the patient record (Tab to
 * it, Enter opens); the caption reads "Showing X–Y of Z" and the pager has labelled buttons.
 */
import type { PatientSummary } from "@laif/contracts";
import { formatDate } from "@laif/i18n";
import { useLanguage } from "@laif/i18n";
import {
  AccessibleDataTable,
  Pagination,
  StatusChip,
  useTx,
  type DataTableColumn,
} from "@laif/ui-web";
import { useMemo, type ReactNode } from "react";
import { Link } from "react-router";

import { facilityLabel } from "../../app/persona-labels.ts";
import { routes } from "../../app/routes.ts";
import { ageSexLabel } from "./labels.ts";

export type PatientResultsTableProps = {
  rows: readonly PatientSummary[];
  page: number;
  pageSize: number;
  total: number;
  onPageChange: (page: number) => void;
  emptyState: ReactNode;
};

export function PatientResultsTable({
  rows,
  page,
  pageSize,
  total,
  onPageChange,
  emptyState,
}: PatientResultsTableProps) {
  const t = useTx();
  const { language } = useLanguage();

  const columns = useMemo<DataTableColumn<PatientSummary>[]>(
    () => [
      {
        id: "syntheticId",
        header: t("clinical:patients.table.syntheticId"),
        cell: (row) => <span className="font-mono text-[13px]">{row.syntheticIdentifier}</span>,
      },
      {
        id: "name",
        header: t("clinical:patients.table.name"),
        isRowHeader: true,
        cell: (row) => (
          <Link
            to={routes.patient(row.id)}
            className="text-primary-dark target-min inline-flex items-center font-semibold underline-offset-2 hover:underline"
            data-testid="patient-row-link"
          >
            {row.displayName}
          </Link>
        ),
      },
      {
        id: "ageSex",
        header: t("clinical:patients.table.ageSex"),
        cell: (row) => ageSexLabel(t, row),
      },
      {
        id: "facility",
        header: t("clinical:patients.table.facility"),
        cell: (row) => facilityLabel(row.facilityId, t),
      },
      {
        id: "lastScreening",
        header: t("clinical:patients.table.lastScreening"),
        cell: (row) =>
          row.lastScreeningAt === null ? (
            <span className="text-muted">{t("clinical:patients.table.noScreening")}</span>
          ) : (
            <time dateTime={row.lastScreeningAt}>{formatDate(row.lastScreeningAt, language)}</time>
          ),
      },
      {
        id: "openItems",
        header: t("clinical:patients.table.openItems"),
        align: "end",
        cell: (row) =>
          row.openItems > 0 ? (
            <StatusChip tone="info">{String(row.openItems)}</StatusChip>
          ) : (
            <span className="text-muted tabular-nums">0</span>
          ),
      },
    ],
    [t, language],
  );

  const from = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const to = Math.min(total, (page - 1) * pageSize + rows.length);
  const caption =
    total === 0
      ? t("clinical:patients.search.results.none")
      : t("clinical:patients.search.results.caption", { from, to, total });

  return (
    <AccessibleDataTable
      caption={caption}
      columns={columns}
      rows={rows}
      getRowId={(row) => row.id}
      totalCount={total}
      hideCount
      emptyState={emptyState}
      footer={
        total > pageSize ? (
          <Pagination page={page} pageSize={pageSize} total={total} onPageChange={onPageChange} />
        ) : null
      }
    />
  );
}
