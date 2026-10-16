import { cx } from "../cx.ts";
import { useTx } from "../i18n.ts";
import { IconButton } from "./IconButton.tsx";

export type PaginationProps = {
  /** 1-based page. */
  page: number;
  pageSize: number;
  total: number;
  onPageChange: (page: number) => void;
  className?: string;
};

export function pageCount(total: number, pageSize: number): number {
  return Math.max(1, Math.ceil(total / Math.max(1, pageSize)));
}

/** Previous / next pager with "Page n of m" (FRD lists paginate at 25). */
export function Pagination({ page, pageSize, total, onPageChange, className }: PaginationProps) {
  const t = useTx();
  const pages = pageCount(total, pageSize);
  const current = Math.min(Math.max(1, page), pages);
  return (
    <nav
      aria-label={t("common:table.pagination")}
      className={cx("flex items-center gap-2", className)}
    >
      <IconButton
        icon="chevron-left"
        labelKey="common:table.previousPage"
        variant="outline"
        tooltip={false}
        className="size-8"
        disabled={current <= 1}
        onClick={() => onPageChange(current - 1)}
      />
      <span className="text-muted text-xs tabular-nums" aria-live="polite">
        {t("common:table.page", { page: current, pages })}
      </span>
      <IconButton
        icon="chevron"
        labelKey="common:table.nextPage"
        variant="outline"
        tooltip={false}
        className="size-8"
        disabled={current >= pages}
        onClick={() => onPageChange(current + 1)}
      />
    </nav>
  );
}
