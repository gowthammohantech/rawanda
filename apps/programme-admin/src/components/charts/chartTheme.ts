/**
 * Chart series styles (ADM-02): semantic design tokens (CSS variables, never raw hex) + a dash
 * pattern and a marker per series, so series stay distinguishable without colour.
 */
export type SeriesMarker = "circle" | "square" | "triangle";

export type SeriesStyle = {
  /** CSS colour from a design token, e.g. `var(--color-primary)`. */
  color: string;
  /** SVG `stroke-dasharray`; undefined = solid. */
  dash?: string;
  marker: SeriesMarker;
};

export const CHART_SERIES = {
  screened: { color: "var(--color-primary)", marker: "circle" },
  flagged: { color: "var(--color-risk-warning)", dash: "6 4", marker: "square" },
} as const satisfies Record<string, SeriesStyle>;
export type ChartSeriesId = keyof typeof CHART_SERIES;

export const CHART_AXIS = {
  grid: "var(--color-border-soft)",
  tick: "var(--color-muted)",
  fontSize: 11,
} as const;

/** Bar fill of `HBarList` (Tailwind token class). */
export const BAR_FILL_CLASS = "bg-primary";
