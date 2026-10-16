import type { ReactNode } from "react";

import { cx } from "../cx.ts";
import { MetricCard } from "./MetricCard.tsx";
import type { Tone } from "./tone.ts";
import { DEFAULT_SUPPRESSION_THRESHOLD, type MetricValue } from "./metric-value.ts";

export type KpiItem = {
  id?: string;
  label: ReactNode;
  /** `{ value, suppressed: true }` renders "Suppressed (<threshold)". */
  value: MetricValue;
  hint?: ReactNode;
  tone?: Tone;
};

export type KpiStripProps = {
  items: readonly KpiItem[];
  /** Accessible name of the strip (e.g. the page's KPI heading). */
  label?: string;
  suppressionThreshold?: number;
  className?: string;
};

/** One white card split by vertical dividers (ref image 1/5); wraps to a grid on narrow screens. */
export function KpiStrip({
  items,
  label,
  suppressionThreshold = DEFAULT_SUPPRESSION_THRESHOLD,
  className,
}: KpiStripProps) {
  return (
    <dl
      aria-label={label}
      className={cx(
        "border-border-soft bg-surface shadow-card m-0 grid grid-cols-2 gap-y-4 rounded-lg border px-5 py-4",
        "sm:grid-cols-[repeat(auto-fit,minmax(150px,1fr))]",
        className,
      )}
    >
      {items.map((item, index) => (
        <MetricCard
          key={item.id ?? index}
          variant="plain"
          label={item.label}
          value={item.value}
          {...(item.hint === undefined ? {} : { hint: item.hint })}
          {...(item.tone === undefined ? {} : { tone: item.tone })}
          suppressionThreshold={suppressionThreshold}
          className={cx("px-4 first:ps-0", index > 0 && "sm:border-border-soft sm:border-s")}
        />
      ))}
    </dl>
  );
}
