import { cx } from "../cx.ts";
import { useTx } from "../i18n.ts";

export type LoadingSkeletonProps = {
  /** Number of placeholder lines (rows). */
  lines?: number;
  /** `card` adds a white card frame; `kpi` mimics a KPI strip; `table` mimics rows. */
  variant?: "lines" | "card" | "kpi" | "table";
  className?: string;
};

/** Fixed-height placeholder (no layout shift) with `aria-busy` and a translated label. */
export function LoadingSkeleton({ lines = 3, variant = "lines", className }: LoadingSkeletonProps) {
  const t = useTx();
  const bar = "animate-pulse rounded-sm bg-border-soft motion-reduce:animate-none";
  return (
    <div
      role="status"
      aria-busy="true"
      aria-live="polite"
      className={cx(
        (variant === "card" || variant === "kpi" || variant === "table") &&
          "border-border-soft bg-surface rounded-lg border p-5",
        className,
      )}
    >
      <span className="sr-only">{t("common:state.loading")}</span>
      {variant === "kpi" ? (
        <div aria-hidden="true" className="grid grid-cols-2 gap-4 sm:grid-cols-4">
          {Array.from({ length: Math.max(lines, 4) }, (_, i) => (
            <div key={i} className="space-y-2">
              <div className={cx(bar, "h-3 w-24")} />
              <div className={cx(bar, "h-7 w-16")} />
            </div>
          ))}
        </div>
      ) : (
        <div aria-hidden="true" className="space-y-3">
          {Array.from({ length: lines }, (_, i) => (
            <div
              key={i}
              className={cx(
                bar,
                variant === "table" ? "h-9 w-full" : "h-3",
                variant !== "table" && (i % 3 === 2 ? "w-2/3" : "w-full"),
              )}
            />
          ))}
        </div>
      )}
    </div>
  );
}
