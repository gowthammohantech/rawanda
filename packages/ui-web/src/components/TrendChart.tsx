import { formatNumber, useLanguage } from "@laif/i18n";
import { useId } from "react";

import { cx } from "../cx.ts";
import { useTx } from "../i18n.ts";
import { TONE_FILL_CLASS, TONE_STROKE_CLASS, type Tone } from "./tone.ts";

export type TrendSeries = {
  id: string;
  /** Translated legend label. */
  label: string;
  /** One value per category (same order as `categories`); `null` = no data / suppressed. */
  values: readonly (number | null)[];
  tone?: Tone | "primary";
  dashed?: boolean;
};

export type TrendChartProps = {
  /** Translated chart title (SVG `<title>` and visible heading). */
  title: string;
  /** Translated summary for screen readers (SVG `<desc>`). */
  description: string;
  /** X-axis labels (already formatted, e.g. "SEP 4"). */
  categories: readonly string[];
  series: readonly TrendSeries[];
  /** Y maximum; defaults to the largest value rounded up. */
  yMax?: number;
  /** Number of horizontal grid lines. */
  ticks?: number;
  height?: number;
  hideTitle?: boolean;
  className?: string;
};

const WIDTH = 880;
const PAD = { top: 12, right: 36, bottom: 28, left: 32 };

function niceMax(value: number): number {
  if (value <= 0) return 1;
  const magnitude = 10 ** Math.floor(Math.log10(value));
  const step = magnitude / 2;
  return Math.ceil(value / step) * step;
}

/** Dependency-free SVG line chart with `<title>`/`<desc>` and a visually hidden data table. */
export function TrendChart({
  title,
  description,
  categories,
  series,
  yMax,
  ticks = 3,
  height = 220,
  hideTitle = false,
  className,
}: TrendChartProps) {
  const t = useTx();
  const { language } = useLanguage();
  const titleId = useId();
  const descId = useId();
  const all = series.flatMap((s) => s.values.filter((v): v is number => v !== null));
  const top = yMax ?? niceMax(Math.max(0, ...all));
  const plotW = WIDTH - PAD.left - PAD.right;
  const plotH = height - PAD.top - PAD.bottom;
  const x = (index: number) =>
    PAD.left + (categories.length <= 1 ? plotW / 2 : (index / (categories.length - 1)) * plotW);
  const y = (value: number) => PAD.top + plotH - (Math.min(value, top) / top) * plotH;
  const gridValues = Array.from({ length: ticks + 1 }, (_, i) => (top / ticks) * i);

  return (
    <figure className={cx("m-0", className)}>
      {hideTitle ? null : (
        <figcaption className="mb-2 flex flex-wrap items-center justify-between gap-2">
          <span className="text-ink text-[15px] font-semibold">{title}</span>
          <span className="text-muted flex flex-wrap gap-3 text-xs" aria-hidden="true">
            {series.map((s) => (
              <span key={s.id} className="inline-flex items-center gap-1.5">
                <span className={cx("rounded-pill size-2", TONE_FILL_CLASS[s.tone ?? "primary"])} />
                {s.label}
              </span>
            ))}
          </span>
        </figcaption>
      )}
      <svg
        role="img"
        aria-labelledby={`${titleId} ${descId}`}
        viewBox={`0 0 ${WIDTH} ${height}`}
        className="h-auto w-full overflow-visible"
        preserveAspectRatio="xMidYMid meet"
      >
        <title id={titleId}>{title}</title>
        <desc id={descId}>{description}</desc>
        {gridValues.map((value) => (
          <g key={value}>
            <line
              x1={PAD.left}
              x2={WIDTH - PAD.right}
              y1={y(value)}
              y2={y(value)}
              className="stroke-border-soft"
              strokeWidth={1}
            />
            <text
              x={PAD.left - 8}
              y={y(value) + 4}
              textAnchor="end"
              className="fill-subtle font-mono text-[10px]"
            >
              {formatNumber(value, language, { maximumFractionDigits: 1 })}
            </text>
          </g>
        ))}
        {categories.map((category, index) => (
          <text
            key={`${category}-${index}`}
            x={x(index)}
            y={height - 8}
            textAnchor="middle"
            className="fill-subtle font-mono text-[10px] uppercase"
          >
            {category}
          </text>
        ))}
        {series.map((s) => {
          const points = s.values
            .map((value, index) => (value === null ? null : `${x(index)},${y(value)}`))
            .filter((point): point is string => point !== null);
          let lastIndex = -1;
          s.values.forEach((value, index) => {
            if (value !== null) lastIndex = index;
          });
          const last = lastIndex >= 0 ? s.values[lastIndex] : null;
          const strokeClass = TONE_STROKE_CLASS[s.tone ?? "primary"];
          return (
            <g key={s.id} data-series={s.id}>
              <polyline
                points={points.join(" ")}
                fill="none"
                strokeWidth={2}
                strokeLinejoin="round"
                strokeLinecap="round"
                strokeDasharray={s.dashed === true ? "6 5" : undefined}
                className={strokeClass}
              />
              {last === null || last === undefined ? null : (
                <>
                  <circle
                    cx={x(lastIndex)}
                    cy={y(last)}
                    r={3.5}
                    className={cx(strokeClass, "fill-surface")}
                    strokeWidth={2}
                  />
                  <text
                    x={x(lastIndex) + 8}
                    y={y(last) + 4}
                    className="fill-ink font-mono text-[10px]"
                  >
                    {formatNumber(last, language)}
                  </text>
                </>
              )}
            </g>
          );
        })}
      </svg>
      <table className="sr-only">
        <caption>{t("common:ui.chartData", { title })}</caption>
        <thead>
          <tr>
            <th scope="col">{t("common:ui.chartCategory")}</th>
            {series.map((s) => (
              <th key={s.id} scope="col">
                {s.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {categories.map((category, index) => (
            <tr key={`${category}-${index}`}>
              <th scope="row">{category}</th>
              {series.map((s) => {
                const value = s.values[index];
                return (
                  <td key={s.id}>
                    {value === null || value === undefined
                      ? t("common:ui.notRecorded")
                      : formatNumber(value, language)}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </figure>
  );
}
