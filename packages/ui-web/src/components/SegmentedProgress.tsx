import { cx } from "../cx.ts";
import { useTx } from "../i18n.ts";
import { TONE_FILL_CLASS, type Tone } from "./tone.ts";

export type SegmentedProgressProps = {
  /** Number of segments (e.g. 8 actions). */
  total: number;
  completed: number;
  /** Accessible name (already translated). */
  label: string;
  tone?: Tone | "primary";
  className?: string;
};

/** Segmented bar: "5 of 8 actions done" / "Seats 8 / 10" (ref image 3). */
export function SegmentedProgress({
  total,
  completed,
  label,
  tone = "primary",
  className,
}: SegmentedProgressProps) {
  const t = useTx();
  const count = Math.max(0, Math.floor(total));
  const done = Math.min(Math.max(0, Math.floor(completed)), count);
  return (
    <div
      role="progressbar"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={count}
      aria-valuenow={done}
      aria-valuetext={t("common:ui.progress", { value: done, max: count })}
      className={cx("flex w-full gap-1", className)}
    >
      {Array.from({ length: count }, (_, index) => (
        <span
          key={index}
          data-done={index < done || undefined}
          className={cx(
            "rounded-pill h-2 flex-1",
            index < done ? TONE_FILL_CLASS[tone] : "bg-border-soft",
          )}
        />
      ))}
    </div>
  );
}
