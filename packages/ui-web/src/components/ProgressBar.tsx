import type { ReactNode } from "react";

import { cx } from "../cx.ts";
import { useTx } from "../i18n.ts";
import { TONE_FILL_CLASS, type Tone } from "./tone.ts";

export type ProgressBarProps = {
  value: number;
  max?: number;
  /** Accessible + visible label (already translated). */
  label: string;
  /** Hide the visible label row (the accessible name stays). */
  hideLabel?: boolean;
  /** Visible value text on the right (e.g. "72%"). Defaults to "value of max". */
  valueText?: ReactNode;
  tone?: Tone | "primary";
  className?: string;
};

/** Thin horizontal progress bar (ref images 2/3). */
export function ProgressBar({
  value,
  max = 100,
  label,
  hideLabel = false,
  valueText,
  tone = "primary",
  className,
}: ProgressBarProps) {
  const t = useTx();
  const safeMax = max > 0 ? max : 1;
  const clamped = Math.min(Math.max(value, 0), safeMax);
  const percent = (clamped / safeMax) * 100;
  const text = t("common:ui.progress", { value: clamped, max: safeMax });
  return (
    <div className={cx("w-full", className)}>
      {hideLabel ? null : (
        <div className="mb-1.5 flex items-baseline justify-between gap-2 text-[13px]">
          <span className="text-ink">{label}</span>
          <span className="text-ink font-medium tabular-nums">{valueText ?? text}</span>
        </div>
      )}
      <div
        role="progressbar"
        aria-label={label}
        aria-valuemin={0}
        aria-valuemax={safeMax}
        aria-valuenow={clamped}
        aria-valuetext={text}
        className="rounded-pill bg-border-soft h-2 w-full overflow-hidden"
      >
        <div
          className={cx("rounded-pill h-full transition-[width]", TONE_FILL_CLASS[tone])}
          style={{ width: `${percent}%` }}
        />
      </div>
    </div>
  );
}
