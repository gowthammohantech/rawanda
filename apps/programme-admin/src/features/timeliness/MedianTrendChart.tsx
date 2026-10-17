/**
 * Weekly median days to review (ADM-04): `LineTrend` with one series; the tooltip and the table
 * show n per week so medians of small samples are visible. Hidden weeks break the line.
 */
import type { AggregateCell } from "@laif/analytics";
import { useTx } from "@laif/ui-web";
import type { ReactNode } from "react";

import { ChartFrame } from "../../components/charts/ChartFrame.tsx";
import { ChartTable } from "../../components/charts/ChartTable.tsx";
import { CHART_SERIES } from "../../components/charts/chartTheme.ts";
import { LineTrend } from "../../components/charts/LineTrend.tsx";
import { SuppressedValue, useCellText } from "../../components/SuppressedValue.tsx";
import { useDaysFormat, useWeekLabel } from "./format.ts";
import type { MedianWeek } from "./selectTimeliness.ts";

const shownValue = (c: AggregateCell): number | null => (c.suppressed ? null : c.value);

export function MedianTrendChart({
  weeks,
  threshold,
  aside,
}: {
  weeks: readonly MedianWeek[];
  threshold: number;
  aside?: ReactNode;
}) {
  const t = useTx();
  const days = useDaysFormat();
  const weekLabel = useWeekLabel();
  const cellText = useCellText({ short: true });
  const shown = weeks.filter((w) => shownValue(w.median) !== null);
  const first = shown[0];
  const last = shown[shown.length - 1];
  const summary =
    first === undefined || last === undefined
      ? t("admin:timeliness.median.summaryNone", { weeks: weeks.length })
      : t("admin:timeliness.median.summary", {
          weeks: weeks.length,
          first: days(first.median.value as number),
          last: days(last.median.value as number),
          hidden: weeks.filter((w) => w.median.suppressed).length,
        });
  const nOf = new Map(weeks.map((w) => [weekLabel(w.weekStart), w.n]));
  const series = [
    { id: "median", label: t("admin:timeliness.median.median"), style: CHART_SERIES.median },
  ];
  return (
    <ChartFrame
      testId="chart-median"
      title={t("admin:timeliness.median.title")}
      summary={summary}
      {...(aside === undefined ? {} : { aside })}
      legend={series}
      chart={(size) => (
        <LineTrend
          {...size}
          allowDecimals
          data={weeks.map((w) => ({ x: weekLabel(w.weekStart), median: shownValue(w.median) }))}
          series={series}
          formatTooltip={(value, _id, row) => {
            const n = nOf.get(String(row["x"]));
            return t("admin:timeliness.median.tooltip", {
              value: days(value),
              n: n === undefined ? "—" : cellText(n, threshold),
            });
          }}
        />
      )}
      table={
        <ChartTable
          caption={t("admin:timeliness.median.title")}
          rows={weeks}
          getRowId={(w) => w.weekStart}
          columns={[
            {
              id: "week",
              header: t("admin:timeliness.median.week"),
              cell: (w) => weekLabel(w.weekStart),
              isRowHeader: true,
            },
            {
              id: "median",
              header: t("admin:timeliness.median.median"),
              align: "end",
              cell: (w) => (
                <SuppressedValue
                  cell={w.median}
                  threshold={threshold}
                  format={days}
                  derived
                  compact
                />
              ),
            },
            {
              id: "n",
              header: t("admin:timeliness.median.n"),
              align: "end",
              cell: (w) => <SuppressedValue cell={w.n} threshold={threshold} compact />,
            },
          ]}
        />
      }
    />
  );
}
