/**
 * Weekly staff minutes per patient-day (ADM-05): `LineTrend`, one pooled value per Kigali ISO
 * week (Σ minutes ÷ Σ patient-days of the week), hidden with the week's patient-days (< k or
 * complementary) and broken where there were no contacts. The table lists patient-days per week.
 */
import type { AggregateCell } from "@laif/analytics";
import { useTx } from "@laif/ui-web";
import type { ReactNode } from "react";

import { ChartFrame } from "../../components/charts/ChartFrame.tsx";
import { ChartTable } from "../../components/charts/ChartTable.tsx";
import { CHART_SERIES } from "../../components/charts/chartTheme.ts";
import { LineTrend } from "../../components/charts/LineTrend.tsx";
import { SuppressedValue, useCellText } from "../../components/SuppressedValue.tsx";
import { useWeekLabel } from "../timeliness/format.ts";
import { useMinutesFormat } from "./format.ts";
import type { WeeklyMinutesPoint } from "./selectWorkload.ts";

const shownValue = (c: AggregateCell): number | null => (c.suppressed ? null : c.value);

export function WeeklyMinutesTrend({
  weeks,
  threshold,
  aside,
}: {
  weeks: readonly WeeklyMinutesPoint[];
  threshold: number;
  aside?: ReactNode;
}) {
  const t = useTx();
  const minutes = useMinutesFormat();
  const weekLabel = useWeekLabel();
  const cellText = useCellText({ short: true });
  const shown = weeks.filter((w) => shownValue(w.value) !== null);
  const first = shown[0];
  const last = shown[shown.length - 1];
  const summary =
    first === undefined || last === undefined
      ? t("admin:workload.trend.summaryNone", { weeks: weeks.length })
      : t("admin:workload.trend.summary", {
          weeks: weeks.length,
          first: minutes(first.value.value as number),
          last: minutes(last.value.value as number),
          hidden: weeks.filter((w) => w.value.suppressed).length,
        });
  const nOf = new Map(weeks.map((w) => [weekLabel(w.weekStart), w.patientDays]));
  const series = [
    {
      id: "value",
      label: t("admin:workload.trend.series"),
      style: CHART_SERIES.minutesPerPatientDay,
    },
  ];
  return (
    <ChartFrame
      testId="chart-weekly-minutes"
      title={t("admin:workload.trend.title")}
      summary={summary}
      {...(aside === undefined ? {} : { aside })}
      legend={series}
      chart={(size) => (
        <LineTrend
          {...size}
          allowDecimals
          data={weeks.map((w) => ({ x: weekLabel(w.weekStart), value: shownValue(w.value) }))}
          series={series}
          formatTooltip={(value, _id, row) => {
            const n = nOf.get(String(row["x"]));
            return t("admin:workload.trend.tooltip", {
              value: minutes(value),
              n: n === undefined ? "—" : cellText(n, threshold),
            });
          }}
        />
      )}
      table={
        <ChartTable
          caption={t("admin:workload.trend.title")}
          rows={weeks}
          getRowId={(w) => w.weekStart}
          columns={[
            {
              id: "week",
              header: t("admin:workload.trend.week"),
              cell: (w) => weekLabel(w.weekStart),
              isRowHeader: true,
            },
            {
              id: "value",
              header: t("admin:workload.trend.series"),
              align: "end",
              cell: (w) => (
                <SuppressedValue
                  cell={w.value}
                  threshold={threshold}
                  format={minutes}
                  derived
                  compact
                />
              ),
            },
            {
              id: "patientDays",
              header: t("admin:workload.trend.patientDays"),
              align: "end",
              cell: (w) => <SuppressedValue cell={w.patientDays} threshold={threshold} compact />,
            },
          ]}
        />
      }
    />
  );
}
