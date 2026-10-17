/**
 * Weekly overdue trend (ADM-04): `LineTrend` with two series — referrals solid + circle,
 * follow-ups dashed + square (readable without colour). Each point counts the items past their
 * clinician-set due date at the week's end; the last point is now (= the Overdue KPIs). The
 * figcaption is generated from i18n templates ("Overdue referrals rose from 2 to 6 …").
 */
import type { AggregateCell } from "@laif/analytics";
import { useTx, type TranslationKey } from "@laif/ui-web";
import type { ReactNode } from "react";

import { ChartFrame } from "../../components/charts/ChartFrame.tsx";
import { ChartTable } from "../../components/charts/ChartTable.tsx";
import { CHART_SERIES } from "../../components/charts/chartTheme.ts";
import { LineTrend } from "../../components/charts/LineTrend.tsx";
import { SuppressedValue, useCellText } from "../../components/SuppressedValue.tsx";
import { useWeekLabel } from "./format.ts";
import type { OverdueWeek } from "./selectTimeliness.ts";

const shownValue = (c: AggregateCell): number | null => (c.suppressed ? null : c.value);

type Direction = "rose" | "fell" | "same" | "hidden";

function direction(first: AggregateCell | undefined, last: AggregateCell | undefined): Direction {
  const a = first === undefined ? null : shownValue(first);
  const b = last === undefined ? null : shownValue(last);
  if (a === null || b === null) return "hidden";
  return b > a ? "rose" : b < a ? "fell" : "same";
}

export function useOverdueSummary(weeks: readonly OverdueWeek[], threshold: number): string {
  const t = useTx();
  const cellText = useCellText({ short: true });
  const first = weeks[0];
  const last = weeks[weeks.length - 1];
  const part = (series: "referrals" | "followUps") => {
    const a = first?.[series];
    const b = last?.[series];
    return t(`admin:timeliness.overdue.trend.${series}.${direction(a, b)}` as TranslationKey, {
      from: a === undefined ? "" : cellText(a, threshold),
      to: b === undefined ? "" : cellText(b, threshold),
      weeks: weeks.length,
    });
  };
  return t("admin:timeliness.overdue.summary", {
    referrals: part("referrals"),
    followUps: part("followUps"),
  });
}

export function OverdueTrendChart({
  weeks,
  threshold,
  aside,
}: {
  weeks: readonly OverdueWeek[];
  threshold: number;
  aside?: ReactNode;
}) {
  const t = useTx();
  const weekLabel = useWeekLabel();
  const summary = useOverdueSummary(weeks, threshold);
  const series = [
    {
      id: "referrals",
      label: t("admin:timeliness.overdue.referrals"),
      style: CHART_SERIES.overdueReferrals,
    },
    {
      id: "followUps",
      label: t("admin:timeliness.overdue.followUps"),
      style: CHART_SERIES.overdueFollowUps,
    },
  ];
  const rowLabel = (w: OverdueWeek) =>
    w.current
      ? t("admin:timeliness.overdue.current", { week: weekLabel(w.weekStart) })
      : weekLabel(w.weekStart);
  return (
    <ChartFrame
      testId="chart-overdue"
      title={t("admin:timeliness.overdue.title")}
      summary={summary}
      {...(aside === undefined ? {} : { aside })}
      legend={series}
      chart={(size) => (
        <LineTrend
          {...size}
          data={weeks.map((w) => ({
            x: weekLabel(w.weekStart),
            referrals: shownValue(w.referrals),
            followUps: shownValue(w.followUps),
          }))}
          series={series}
        />
      )}
      table={
        <ChartTable
          caption={t("admin:timeliness.overdue.title")}
          rows={weeks}
          getRowId={(w) => w.weekStart}
          columns={[
            {
              id: "week",
              header: t("admin:timeliness.overdue.week"),
              cell: rowLabel,
              isRowHeader: true,
            },
            {
              id: "referrals",
              header: t("admin:timeliness.overdue.referrals"),
              align: "end",
              cell: (w) => <SuppressedValue cell={w.referrals} threshold={threshold} compact />,
            },
            {
              id: "followUps",
              header: t("admin:timeliness.overdue.followUps"),
              align: "end",
              cell: (w) => <SuppressedValue cell={w.followUps} threshold={threshold} compact />,
            },
          ]}
        />
      }
    />
  );
}
