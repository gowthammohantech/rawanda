/**
 * Median days to review by facility (ADM-04): `HBarList`, value = median days, secondary label
 * n. Rows link to `/admin/timeliness?facility=<id>` (filter narrowing; still ScopeGuard-checked).
 * A median whose n is below k (or hidden with it) shows as hidden.
 */
import { useTx } from "@laif/ui-web";
import type { ReactNode } from "react";

import { paths } from "../../app/nav.ts";
import { facilityLabel } from "../../app/persona-labels.ts";
import { ChartFrame } from "../../components/charts/ChartFrame.tsx";
import { ChartTable } from "../../components/charts/ChartTable.tsx";
import { HBarList } from "../../components/charts/HBarList.tsx";
import { SuppressedValue, useCellText } from "../../components/SuppressedValue.tsx";
import { serializeAdminFilters, type AdminFilters } from "../filters/filterSchema.ts";
import { useDaysFormat } from "./format.ts";
import type { FacilityMedianRow } from "./selectTimeliness.ts";

export function FacilityMedianList({
  rows,
  threshold,
  filters,
  aside,
}: {
  rows: readonly FacilityMedianRow[];
  threshold: number;
  filters: AdminFilters;
  aside?: ReactNode;
}) {
  const t = useTx();
  const days = useDaysFormat();
  const cellText = useCellText({ short: true });
  const summary = t("admin:timeliness.facility.summary", {
    count: rows.length,
    hidden: rows.filter((r) => r.median.suppressed).length,
    k: threshold,
  });
  const linkOf = (facilityId: string) =>
    `${paths.timeliness}${serializeAdminFilters({ ...filters, facility: facilityId })}`;
  return (
    <ChartFrame
      testId="chart-facility-median"
      html
      title={t("admin:timeliness.facility.title")}
      summary={summary}
      {...(aside === undefined ? {} : { aside })}
      chart={() => (
        <HBarList
          label={t("admin:timeliness.facility.title")}
          threshold={threshold}
          valueFormat={days}
          derived
          rows={rows.map((r) => ({
            id: r.facilityId,
            label: facilityLabel(r.facilityId, t),
            value: r.median,
            secondary: t("admin:timeliness.facility.nLabel", { n: cellText(r.n, threshold) }),
            to: linkOf(r.facilityId),
            linkLabel: t("admin:timeliness.facility.link", {
              facility: facilityLabel(r.facilityId, t),
            }),
          }))}
        />
      )}
      table={
        <ChartTable
          caption={t("admin:timeliness.facility.title")}
          rows={rows}
          getRowId={(r) => r.facilityId}
          columns={[
            {
              id: "facility",
              header: t("admin:timeliness.facility.facility"),
              cell: (r) => facilityLabel(r.facilityId, t),
              isRowHeader: true,
            },
            {
              id: "median",
              header: t("admin:timeliness.facility.median"),
              align: "end",
              cell: (r) => (
                <SuppressedValue
                  cell={r.median}
                  threshold={threshold}
                  format={days}
                  derived
                  compact
                />
              ),
            },
            {
              id: "n",
              header: t("admin:timeliness.facility.n"),
              align: "end",
              cell: (r) => <SuppressedValue cell={r.n} threshold={threshold} compact />,
            },
          ]}
        />
      }
    />
  );
}
