/**
 * Weekly quality trend (ADM-06): `LineTrend` of screenings with missing fields (week of the
 * measurement) and identity mismatches per Kigali ISO week. Each series sums to its KPI (lines in
 * the scope-wide pass); suppressed weeks break the line; the table lists every week.
 */
import { useTx } from "@laif/ui-web";
import type { AggregateCell } from "@laif/analytics";
import type { ReactNode } from "react";

import { ChartFrame } from "../../components/charts/ChartFrame.tsx";
import { ChartTable } from "../../components/charts/ChartTable.tsx";
import { CHART_SERIES } from "../../components/charts/chartTheme.ts";
import { LineTrend } from "../../components/charts/LineTrend.tsx";
import { SuppressedValue } from "../../components/SuppressedValue.tsx";
import { useWeekLabel } from "../timeliness/format.ts";
import type { QualityWeek } from "./selectQuality.ts";

const shownValue = (c: AggregateCell): number | null => (c.suppressed ? null : c.value);

export function QualityTrendChart({
  weeks,
  threshold,
  aside,
}: {
  weeks: readonly QualityWeek[];
  threshold: number;
  aside?: ReactNode;
}) {
  const t = useTx();
  const weekLabel = useWeekLabel();
  const series = [
    {
      id: "missingFields",
      label: t("admin:quality.trend.missing"),
      style: CHART_SERIES.missingFields,
    },
    {
      id: "mismatches",
      label: t("admin:quality.trend.mismatches"),
      style: CHART_SERIES.mismatches,
    },
  ];
  const hidden = weeks.filter((w) => w.missingFields.suppressed || w.mismatches.suppressed).length;
  return (
    <ChartFrame
      testId="chart-quality-trend"
      title={t("admin:quality.trend.title")}
      summary={t("admin:quality.trend.summary", { weeks: weeks.length, hidden })}
      {...(aside === undefined ? {} : { aside })}
      legend={series}
      chart={(size) => (
        <LineTrend
          {...size}
          data={weeks.map((w) => ({
            x: weekLabel(w.weekStart),
            missingFields: shownValue(w.missingFields),
            mismatches: shownValue(w.mismatches),
          }))}
          series={series}
        />
      )}
      table={
        <ChartTable
          caption={t("admin:quality.trend.title")}
          rows={weeks}
          getRowId={(w) => w.weekStart}
          columns={[
            {
              id: "week",
              header: t("admin:quality.trend.week"),
              cell: (w) => weekLabel(w.weekStart),
              isRowHeader: true,
            },
            {
              id: "missingFields",
              header: t("admin:quality.trend.missing"),
              align: "end",
              cell: (w) => <SuppressedValue cell={w.missingFields} threshold={threshold} compact />,
            },
            {
              id: "mismatches",
              header: t("admin:quality.trend.mismatches"),
              align: "end",
              cell: (w) => <SuppressedValue cell={w.mismatches} threshold={threshold} compact />,
            },
          ]}
        />
      }
    />
  );
}
