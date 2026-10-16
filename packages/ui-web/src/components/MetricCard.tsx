import type { ReactNode } from "react";

import { cx } from "../cx.ts";
import { useTx } from "../i18n.ts";
import { TONE_FILL_CLASS, TONE_TEXT_CLASS, type Tone } from "./tone.ts";
import {
  DEFAULT_SUPPRESSION_THRESHOLD,
  useMetricFormatter,
  type MetricValue,
} from "./metric-value.ts";

export type MetricCardProps = {
  label: ReactNode;
  value: MetricValue;
  /** Small text after the value ("in 30 days", "+12%"). */
  hint?: ReactNode;
  /** Adds a coloured dot before the label (with the label text it is never colour-only). */
  tone?: Tone;
  suppressionThreshold?: number;
  /**
   * `card` = standalone white card (renders its own `<dl>`); `plain` = a `<div>` group of
   * `<dt>`/`<dd>` for use inside a parent `<dl>` (KpiStrip).
   */
  variant?: "card" | "plain";
  className?: string;
};

/** One metric: label, big number, hint (ref image 1 KPI cell). */
export function MetricCard({
  label,
  value,
  hint,
  tone,
  suppressionThreshold = DEFAULT_SUPPRESSION_THRESHOLD,
  variant = "card",
  className,
}: MetricCardProps) {
  const t = useTx();
  const format = useMetricFormatter();
  const formatted = format(value, suppressionThreshold);
  const body = (
    <div className={cx("min-w-0", variant === "plain" && className)}>
      <dt className="text-muted flex items-center gap-1.5 text-[13px]">
        {tone === undefined ? null : (
          <span
            aria-hidden="true"
            className={cx("rounded-pill size-1.5 shrink-0", TONE_FILL_CLASS[tone])}
          />
        )}
        {label}
      </dt>
      <dd className="m-0 mt-1.5 flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
        <span
          data-suppressed={formatted.suppressed || undefined}
          className={cx(
            "font-display text-ink leading-none font-semibold",
            formatted.suppressed ? "text-muted text-sm font-medium" : "text-[26px]",
          )}
          title={
            formatted.suppressed
              ? t("common:suppressedExplanation", { threshold: suppressionThreshold })
              : undefined
          }
        >
          {formatted.text}
        </span>
        {hint === undefined ? null : (
          <span
            className={cx("text-xs", tone === undefined ? "text-muted" : TONE_TEXT_CLASS[tone])}
          >
            {hint}
          </span>
        )}
      </dd>
    </div>
  );
  if (variant === "plain") return body;
  return (
    <dl
      className={cx(
        "border-border-soft bg-surface shadow-card m-0 rounded-lg border p-5",
        className,
      )}
    >
      {body}
    </dl>
  );
}
