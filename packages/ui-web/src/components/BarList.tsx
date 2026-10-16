import type { ReactNode } from "react";

import { cx } from "../cx.ts";
import { TONE_FILL_CLASS, type Tone } from "./tone.ts";
import {
  DEFAULT_SUPPRESSION_THRESHOLD,
  useMetricFormatter,
  type MetricValue,
} from "./metric-value.ts";

export type BarListItem = {
  id: string;
  label: ReactNode;
  value: MetricValue;
  /** Extra text right of the value ("31%"). */
  secondary?: ReactNode;
  /** Optional chip after the label (e.g. a CONSTRAINT StatusChip). */
  adornment?: ReactNode;
  tone?: Tone | "primary";
};

export type BarListProps = {
  items: readonly BarListItem[];
  /** Accessible list name (already translated). */
  label: string;
  /** Scale maximum; defaults to the largest numeric value. */
  max?: number;
  suppressionThreshold?: number;
  tone?: Tone | "primary";
  className?: string;
};

/** Labelled horizontal bars (ref image 1 "Most asked topics"); dependency-free. */
export function BarList({
  items,
  label,
  max,
  suppressionThreshold = DEFAULT_SUPPRESSION_THRESHOLD,
  tone = "primary",
  className,
}: BarListProps) {
  const format = useMetricFormatter();
  const rows = items.map((item) => ({ item, formatted: format(item.value, suppressionThreshold) }));
  const scale =
    max ??
    Math.max(1, ...rows.map((row) => (row.formatted.numeric === null ? 0 : row.formatted.numeric)));
  return (
    <ul aria-label={label} className={cx("m-0 list-none space-y-4 p-0", className)}>
      {rows.map(({ item, formatted }) => {
        const percent =
          formatted.numeric === null ? 0 : Math.min(100, (formatted.numeric / scale) * 100);
        return (
          <li key={item.id}>
            <div className="mb-1.5 flex items-center justify-between gap-3 text-[13px]">
              <span className="text-ink flex min-w-0 items-center gap-2">
                <span className="truncate">{item.label}</span>
                {item.adornment}
              </span>
              <span className="text-ink flex shrink-0 items-baseline gap-3 font-mono tabular-nums">
                <span className={cx(formatted.suppressed && "text-muted font-sans text-xs")}>
                  {formatted.text}
                </span>
                {item.secondary === undefined ? null : (
                  <span className="text-muted text-xs">{item.secondary}</span>
                )}
              </span>
            </div>
            <div
              aria-hidden="true"
              className="rounded-pill bg-border-soft h-2 w-full overflow-hidden"
            >
              <div
                className={cx("rounded-pill h-full", TONE_FILL_CLASS[item.tone ?? tone])}
                style={{ width: `${percent}%` }}
              />
            </div>
          </li>
        );
      })}
    </ul>
  );
}
