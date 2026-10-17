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
  className?: string;
};

export function SuppressedValue({
  cell,
  threshold,
  format,
  emptyText,
  compact = false,
  className,
}: SuppressedValueProps) {
  const t = useTx();
  const { language } = useLanguage();
  if (cell.suppressed) {
    return (
      <span className={cx("inline-flex items-center gap-1.5", className)} data-suppressed="true">
        <span aria-hidden="true">{t("admin:privacy.suppressed.short", { k: threshold })}</span>
        {compact ? null : (
          <span
            aria-hidden="true"
            className="border-border bg-background text-muted rounded-sm border px-1 py-px font-mono text-[10px] font-medium tracking-wide"
          >
            {t("admin:privacy.suppressed.pill")}
          </span>
        )}
        <span className="sr-only">{t("admin:privacy.suppressed.sr", { k: threshold })}</span>
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

/** Plain-text form (aria summaries, figcaptions): "12" or "fewer than 5 (hidden)". */
export function useCellText(): (cell: AggregateCell, threshold: number) => string {
  const t = useTx();
  const { language } = useLanguage();
  return (cell, threshold) =>
    cell.suppressed
      ? t("admin:privacy.suppressed.sr", { k: threshold })
      : cell.value === null
        ? t("admin:privacy.noValue")
        : formatNumber(cell.value, language);
}
