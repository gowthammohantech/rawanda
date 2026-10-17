/**
 * Recharts `LineChart` wrapper (ADM-02 chart kit). Suppressed / missing points are `null` and
 * break the line (never interpolated). Each series has its own dash pattern and marker shape
 * (`chartTheme`), so it is readable without colour; the frame repeats them in the legend.
 */
import { CartesianGrid, Line, LineChart, Tooltip, XAxis, YAxis } from "recharts";

import { CHART_AXIS, type SeriesMarker, type SeriesStyle } from "./chartTheme.ts";
import type { ChartSize } from "./ChartFrame.tsx";

export type LineSeries = { id: string; label: string; style: SeriesStyle };

export type LineTrendProps = ChartSize & {
  /** One row per x category: `{ x: label, [series.id]: number | null }`. */
  data: ReadonlyArray<Record<string, string | number | null>>;
  series: readonly LineSeries[];
};

type DotProps = { cx?: number; cy?: number; value?: unknown };

function markerDot(marker: SeriesMarker, color: string) {
  function MarkerDot({ cx, cy, value }: DotProps) {
    if (cx === undefined || cy === undefined || value === null || value === undefined) {
      return <g />;
    }
    if (marker === "square") {
      return <rect x={cx - 4} y={cy - 4} width={8} height={8} fill={color} />;
    }
    if (marker === "triangle") {
      return (
        <polygon points={`${cx},${cy - 5} ${cx + 5},${cy + 4} ${cx - 5},${cy + 4}`} fill={color} />
      );
    }
    return <circle cx={cx} cy={cy} r={4} fill={color} />;
  }
  return MarkerDot;
}

export function LineTrend({ data, series, width, height }: LineTrendProps) {
  return (
    <LineChart
      data={[...data]}
      {...(width === undefined ? {} : { width })}
      height={height}
      margin={{ top: 8, right: 16, bottom: 4, left: 0 }}
    >
      <CartesianGrid stroke={CHART_AXIS.grid} vertical={false} />
      <XAxis
        dataKey="x"
        tick={{ fill: CHART_AXIS.tick, fontSize: CHART_AXIS.fontSize }}
        tickLine={false}
        axisLine={{ stroke: CHART_AXIS.grid }}
      />
      <YAxis
        allowDecimals={false}
        width={32}
        tick={{ fill: CHART_AXIS.tick, fontSize: CHART_AXIS.fontSize }}
        tickLine={false}
        axisLine={false}
      />
      <Tooltip />
      {series.map((s) => (
        <Line
          key={s.id}
          type="linear"
          dataKey={s.id}
          name={s.label}
          stroke={s.style.color}
          strokeWidth={2}
          {...(s.style.dash === undefined ? {} : { strokeDasharray: s.style.dash })}
          dot={markerDot(s.style.marker, s.style.color)}
          connectNulls={false}
          isAnimationActive={false}
        />
      ))}
    </LineChart>
  );
}
