/**
 * Chart frame (ADM-02 chart kit): `<figure>` with a title, a legend that repeats each series'
 * dash pattern + marker (distinguishable without colour), a "View as table" toggle, the chart
 * (`role="img"` + the summary as its name) and a `<figcaption>` summary. Only this file and
 * `LineTrend` import Recharts. Tests pass `width` / `height`; otherwise the chart is responsive.
 */
import { Button, useTx } from "@laif/ui-web";
import { createContext, useContext, useId, useState, type ReactNode } from "react";
import { ResponsiveContainer } from "recharts";

import type { SeriesStyle } from "./chartTheme.ts";

export type LegendItem = { id: string; label: string; style: SeriesStyle };

export type ChartSize = { width?: number; height: number };

/**
 * Test seam: a fixed chart size for every frame below (jsdom has no layout, so a responsive
 * container would render nothing). The app never provides it.
 */
export const ChartSizeContext = createContext<{ width: number; height: number } | null>(null);

export type ChartFrameProps = {
  title: string;
  /** Plain-language summary of what the chart shows (figcaption + accessible name). */
  summary: string;
  legend?: readonly LegendItem[];
  /** Renders the chart at the given size (`width` undefined = fill the container). */
  chart: (size: ChartSize) => ReactNode;
  table: ReactNode;
  width?: number;
  height?: number;
  /** Extra header content (e.g. a MetricInfo). */
  aside?: ReactNode;
  /**
   * HTML chart (e.g. `HBarList`, itself an accessible list): rendered as is, no SVG container or
   * `role="img"` wrapper.
   */
  html?: boolean;
  testId?: string;
};

export function LegendSwatch({ style }: { style: SeriesStyle }) {
  return (
    <svg width="28" height="12" viewBox="0 0 28 12" aria-hidden="true" className="shrink-0">
      <line
        x1="1"
        y1="6"
        x2="27"
        y2="6"
        stroke={style.color}
        strokeWidth="2"
        {...(style.dash === undefined ? {} : { strokeDasharray: style.dash })}
      />
      {style.marker === "square" ? (
        <rect x="10" y="2" width="8" height="8" fill={style.color} />
      ) : style.marker === "triangle" ? (
        <polygon points="14,1 19,10 9,10" fill={style.color} />
      ) : (
        <circle cx="14" cy="6" r="4" fill={style.color} />
      )}
    </svg>
  );
}

export function ChartFrame({
  title,
  summary,
  legend = [],
  chart,
  table,
  width,
  height = 240,
  aside,
  html = false,
  testId,
}: ChartFrameProps) {
  const t = useTx();
  const fixed = useContext(ChartSizeContext);
  const chartWidth = width ?? fixed?.width;
  const chartHeight = fixed?.height ?? height;
  const [asTable, setAsTable] = useState(false);
  const titleId = useId();
  return (
    <figure
      aria-labelledby={titleId}
      data-testid={testId}
      className="border-border-soft bg-surface shadow-card m-0 rounded-lg border p-5"
    >
      <div className="mb-3 flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-center gap-1">
          <h2 id={titleId} className="text-ink m-0 text-[15px] font-semibold">
            {title}
          </h2>
          {aside}
        </div>
        <Button
          variant="secondary"
          size="sm"
          icon={asTable ? "trend" : "file"}
          aria-pressed={asTable}
          onClick={() => setAsTable((v) => !v)}
        >
          {asTable ? t("admin:charts.viewAsChart") : t("admin:charts.viewAsTable")}
        </Button>
      </div>
      {legend.length === 0 || asTable ? null : (
        <ul
          className="m-0 mb-2 flex list-none flex-wrap gap-4 p-0 text-xs"
          aria-label={t("admin:charts.legend")}
        >
          {legend.map((item) => (
            <li key={item.id} className="text-ink flex items-center gap-2">
              <LegendSwatch style={item.style} />
              {item.label}
            </li>
          ))}
        </ul>
      )}
      {asTable ? (
        <div data-testid="chart-table">{table}</div>
      ) : html ? (
        <div>{chart({ height })}</div>
      ) : (
        <div role="img" aria-label={summary} style={{ height: chartHeight }}>
          {chartWidth === undefined ? (
            <ResponsiveContainer width="100%" height={chartHeight}>
              {chart({ height: chartHeight }) as never}
            </ResponsiveContainer>
          ) : (
            chart({ width: chartWidth, height: chartHeight })
          )}
        </div>
      )}
      <figcaption className="text-muted mt-3 text-xs">{summary}</figcaption>
    </figure>
  );
}
