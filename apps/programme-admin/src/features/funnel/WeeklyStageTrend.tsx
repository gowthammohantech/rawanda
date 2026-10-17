/**
 * Weekly trend of the selected stage, one line per facility (ADM-03 task 5), with the
 * equivalent table ("View as table"). Weekly cells come from the same scope-wide suppression
 * pass as the breakdown (a hidden week breaks the line; never interpolated).
 */
import type { FunnelStageId } from "@laif/analytics";
import { formatDate, useLanguage } from "@laif/i18n";
import { useTx, type TranslationKey } from "@laif/ui-web";

import { facilityLabel } from "../../app/persona-labels.ts";
import { ChartFrame } from "../../components/charts/ChartFrame.tsx";
import { ChartTable } from "../../components/charts/ChartTable.tsx";
import type { SeriesStyle } from "../../components/charts/chartTheme.ts";
import { LineTrend } from "../../components/charts/LineTrend.tsx";
import { SuppressedValue } from "../../components/SuppressedValue.tsx";
import type { FunnelView } from "./selectFunnel.ts";

/** Facility series styles: token colours + distinct dash / marker per series. */
const FACILITY_STYLES: readonly SeriesStyle[] = [
  { color: "var(--color-primary)", marker: "circle" },
  { color: "var(--color-risk-warning)", dash: "6 4", marker: "square" },
  { color: "var(--color-info)", dash: "2 3", marker: "triangle" },
  { color: "var(--color-primary-dark)", dash: "8 3 2 3", marker: "square" },
];

export function WeeklyStageTrend({ view, stage }: { view: FunnelView; stage: FunnelStageId }) {
  const t = useTx();
  const { language } = useLanguage();
  const k = view.threshold;
  const facilities = view.districts.flatMap((d) => d.facilities);
  const series = facilities.map((f, i) => ({
    id: f.key,
    label: facilityLabel(f.key, t),
    style: FACILITY_STYLES[i % FACILITY_STYLES.length] as SeriesStyle,
  }));
  const weekLabel = (w: string) => formatDate(`${w}T12:00:00.000Z`, language);
  const stageLabel = t(`admin:funnel.stage.${stage}` as TranslationKey);
  const hiddenPoints = facilities.reduce(
    (a, f) => a + f.weekly.filter((w) => w[stage].suppressed).length,
    0,
  );
  const rows = view.weeks.map((week, i) => ({ week, index: i }));
  const summary = t("admin:funnel.trend.summary", {
    stage: stageLabel,
    weeks: view.weeks.length,
    facilities: facilities.length,
    hidden: hiddenPoints,
  });

  return (
    <ChartFrame
      testId="chart-stage-weekly"
      title={t("admin:funnel.trend.title", { stage: stageLabel })}
      summary={summary}
      legend={series}
      chart={(size) => (
        <LineTrend
          {...size}
          series={series}
          data={view.weeks.map((week, i) => ({
            x: weekLabel(week),
            ...Object.fromEntries(
              facilities.map((f) => {
                const cell = f.weekly[i]?.[stage];
                return [f.key, cell === undefined || cell.suppressed ? null : cell.value];
              }),
            ),
          }))}
        />
      )}
      table={
        <ChartTable
          caption={t("admin:funnel.trend.title", { stage: stageLabel })}
          rows={rows}
          getRowId={(r) => r.week}
          columns={[
            {
              id: "week",
              header: t("admin:charts.weekly.week"),
              cell: (r) => weekLabel(r.week),
              isRowHeader: true,
            },
            ...facilities.map((f) => ({
              id: f.key,
              header: facilityLabel(f.key, t),
              align: "end" as const,
              cell: (r: (typeof rows)[number]) => {
                const cell = f.weekly[r.index]?.[stage];
                return cell === undefined ? null : (
                  <SuppressedValue cell={cell} threshold={k} compact />
                );
              },
            })),
          ]}
        />
      }
    />
  );
}
