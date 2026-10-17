/**
 * A published aggregate value, or — when small-cell suppression hid it — `<k` with a mono
 * `SUPPRESSED` pill. Screen readers hear "Fewer than k, hidden to protect privacy" instead.
 */
import type { AggregateCell } from "@laif/analytics";
import { formatNumber, useLanguage } from "@laif/i18n";
import { cx, useTx } from "@laif/ui-web";

export type SuppressedValueProps = {
  cell: AggregateCell;
  threshold: number;
  /** Custom formatter for a shown value (default: locale number). */
  format?: (value: number) => string;
  /** Text for a shown `null` (e.g. no data); default "—". */
  emptyText?: string;
  /** Hide the pill (dense tables keep only `<k`). */
  compact?: boolean;
  /**
   * A derived value (e.g. a median) hidden with its basis: shows "Hidden" instead of `<k`, which
   * would read as a bound on the value itself.
   */
  derived?: boolean;
  className?: string;
};

export function SuppressedValue({
  cell,
  threshold,
  format,
  emptyText,
  compact = false,
  derived = false,
  className,
}: SuppressedValueProps) {
  const t = useTx();
  const { language } = useLanguage();
  if (cell.suppressed) {
    return (
      <span className={cx("inline-flex items-center gap-1.5", className)} data-suppressed="true">
        <span aria-hidden="true">
          {derived
            ? t("admin:privacy.suppressed.hidden")
            : t("admin:privacy.suppressed.short", { k: threshold })}
        </span>
        {compact ? null : (
          <span
            aria-hidden="true"
            className="border-border bg-background text-muted rounded-sm border px-1 py-px font-mono text-[10px] font-medium tracking-wide"
          >
            {t("admin:privacy.suppressed.pill")}
          </span>
        )}
        <span className="sr-only">
          {derived
            ? t("admin:privacy.suppressed.derivedSr", { k: threshold })
            : t("admin:privacy.suppressed.sr", { k: threshold })}
        </span>
      </span>
    );
  }
  if (cell.value === null) {
    return <span className={className}>{emptyText ?? t("admin:privacy.noValue")}</span>;
  }
  return (
    <span className={className}>
      {format === undefined ? formatNumber(cell.value, language) : format(cell.value)}
    </span>
  );
}

/**
 * Plain-text form: "12" or "Fewer than 5, hidden to protect privacy" (aria summaries,
 * figcaptions); `short` gives the visible `<5` for inline sub-labels.
 */
export function useCellText(
  options: { short?: boolean } = {},
): (cell: AggregateCell, threshold: number) => string {
  const t = useTx();
  const { language } = useLanguage();
  const suppressedKey =
    options.short === true ? "admin:privacy.suppressed.short" : "admin:privacy.suppressed.sr";
  return (cell, threshold) =>
    cell.suppressed
      ? t(suppressedKey, { k: threshold })
      : cell.value === null
        ? t("admin:privacy.noValue")
        : formatNumber(cell.value, language);
}
