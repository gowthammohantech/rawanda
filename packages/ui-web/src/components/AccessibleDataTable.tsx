import { useMemo, useState, type ReactNode } from "react";

import { cx } from "../cx.ts";
import { useTx } from "../i18n.ts";
import { Icon } from "../icons/Icon.tsx";
import { Button } from "./Button.tsx";

export type SortDirection = "ascending" | "descending";
export type SortState = { columnId: string; direction: SortDirection };

export type DataTableColumn<T> = {
  id: string;
  /** Translated header; also the label shown before the value in stacked (mobile) cards. */
  header: string;
  cell: (row: T) => ReactNode;
  /** Makes the column sortable (client-side unless `onSortChange` is given). */
  sortValue?: (row: T) => string | number | null;
  align?: "start" | "end";
  /** Renders this column's cells as `<th scope="row">` (one per table, usually the name). */
  isRowHeader?: boolean;
  className?: string;
};

export type DataTableRowAction<T> = {
  /** Translated visible label ("Review"). */
  label: string;
  /** Translated accessible label per row ("Review Habimana Noël"). */
  accessibleLabel?: (row: T) => string;
  onAction: (row: T) => void;
};

export type AccessibleDataTableProps<T> = {
  /** Translated caption (required for screen readers); hide visually with `captionHidden`. */
  caption: string;
  captionHidden?: boolean;
  columns: readonly DataTableColumn<T>[];
  rows: readonly T[];
  getRowId: (row: T) => string;
  /** Controlled sort (server-side); omit for client-side sort. */
  sort?: SortState | null;
  defaultSort?: SortState | null;
  onSortChange?: (sort: SortState) => void;
  rowAction?: DataTableRowAction<T>;
  /** Total rows across pages for the "Showing x of y" footer (defaults to `rows.length`). */
  totalCount?: number;
  /** Rendered instead of the body when `rows` is empty. */
  emptyState?: ReactNode;
  /** Extra footer content (e.g. `<Pagination>` or a "See all" link). */
  footer?: ReactNode;
  /** Hides the "Showing x of y" footer text. */
  hideCount?: boolean;
  className?: string;
};

function compare(a: string | number | null, b: string | number | null): number {
  if (a === b) return 0;
  if (a === null) return 1;
  if (b === null) return -1;
  if (typeof a === "number" && typeof b === "number") return a - b;
  return String(a).localeCompare(String(b));
}

/**
 * Accessible table: caption, `scope`d headers, sortable headers with `aria-sort`, row action,
 * "Showing x of y" footer and an empty slot. Below 768 px rows become stacked cards (CSS only;
 * each cell shows its column header via `data-label`).
 */
export function AccessibleDataTable<T>({
  caption,
  captionHidden = false,
  columns,
  rows,
  getRowId,
  sort,
  defaultSort = null,
  onSortChange,
  rowAction,
  totalCount,
  emptyState,
  footer,
  hideCount = false,
  className,
}: AccessibleDataTableProps<T>) {
  const t = useTx();
  const [internalSort, setInternalSort] = useState<SortState | null>(defaultSort);
  const activeSort = sort === undefined ? internalSort : sort;

  const sortedRows = useMemo(() => {
    if (onSortChange !== undefined || activeSort === null) return rows;
    const column = columns.find((c) => c.id === activeSort.columnId);
    if (column?.sortValue === undefined) return rows;
    const factor = activeSort.direction === "ascending" ? 1 : -1;
    const getValue = column.sortValue;
    return [...rows].sort((a, b) => factor * compare(getValue(a), getValue(b)));
  }, [rows, columns, activeSort, onSortChange]);

  const requestSort = (columnId: string) => {
    const direction: SortDirection =
      activeSort?.columnId === columnId && activeSort.direction === "ascending"
        ? "descending"
        : "ascending";
    const next = { columnId, direction };
    if (sort === undefined) setInternalSort(next);
    onSortChange?.(next);
  };

  const total = totalCount ?? rows.length;
  const allColumns = rowAction === undefined ? columns.length : columns.length + 1;

  return (
    <div className={cx("w-full", className)}>
      <table className="w-full border-collapse text-sm max-md:block">
        <caption
          className={cx(
            captionHidden
              ? "sr-only"
              : "text-ink pb-3 text-start text-[15px] font-semibold max-md:block",
          )}
        >
          {caption}
        </caption>
        <thead className="max-md:sr-only">
          <tr className="border-border-soft border-b">
            {columns.map((column) => {
              const isSorted = activeSort?.columnId === column.id;
              const ariaSort =
                column.sortValue === undefined
                  ? undefined
                  : isSorted
                    ? activeSort.direction
                    : "none";
              return (
                <th
                  key={column.id}
                  scope="col"
                  aria-sort={ariaSort}
                  className={cx(
                    "micro-label text-muted px-3 py-2.5 font-medium",
                    column.align === "end" ? "text-end" : "text-start",
                  )}
                >
                  {column.sortValue === undefined ? (
                    column.header
                  ) : (
                    <button
                      type="button"
                      onClick={() => requestSort(column.id)}
                      className="micro-label text-muted hover:text-ink inline-flex items-center gap-1 rounded-sm font-medium uppercase"
                    >
                      {column.header}
                      <Icon
                        name={
                          isSorted
                            ? activeSort.direction === "ascending"
                              ? "chevron-up"
                              : "chevron-down"
                            : "sort"
                        }
                        size={12}
                      />
                      <span className="sr-only">
                        {isSorted
                          ? t(
                              activeSort.direction === "ascending"
                                ? "common:table.sortedAscending"
                                : "common:table.sortedDescending",
                            )
                          : t("common:table.sortBy", { column: column.header })}
                      </span>
                    </button>
                  )}
                </th>
              );
            })}
            {rowAction === undefined ? null : (
              <th scope="col" className="micro-label text-muted px-3 py-2.5 text-end font-medium">
                {t("common:table.actions")}
              </th>
            )}
          </tr>
        </thead>
        <tbody className="max-md:block max-md:space-y-3">
          {sortedRows.length === 0 ? (
            <tr className="max-md:block">
              <td colSpan={allColumns} className="text-muted px-3 py-8 text-center max-md:block">
                {emptyState ?? t("common:table.noResults")}
              </td>
            </tr>
          ) : (
            sortedRows.map((row) => (
              <tr
                key={getRowId(row)}
                className={cx(
                  "border-border-soft hover:bg-background/60 border-b last:border-b-0",
                  "max-md:block max-md:rounded-md max-md:border max-md:p-3",
                )}
              >
                {columns.map((column) => {
                  const Cell = column.isRowHeader === true ? "th" : "td";
                  return (
                    <Cell
                      key={column.id}
                      data-label={column.header}
                      {...(column.isRowHeader === true ? { scope: "row" } : {})}
                      className={cx(
                        "text-ink px-3 py-3 align-middle font-normal",
                        column.align === "end" ? "text-end" : "text-start",
                        "max-md:flex max-md:justify-between max-md:gap-3 max-md:px-0 max-md:py-1 max-md:text-end",
                        "max-md:before:micro-label max-md:before:text-muted max-md:before:text-start max-md:before:content-[attr(data-label)]",
                        column.className,
                      )}
                    >
                      {column.cell(row)}
                    </Cell>
                  );
                })}
                {rowAction === undefined ? null : (
                  <td className="px-3 py-3 text-end max-md:block max-md:px-0 max-md:pt-2">
                    <Button
                      variant="secondary"
                      size="sm"
                      onClick={() => rowAction.onAction(row)}
                      {...(rowAction.accessibleLabel === undefined
                        ? {}
                        : { "aria-label": rowAction.accessibleLabel(row) })}
                    >
                      {rowAction.label}
                    </Button>
                  </td>
                )}
              </tr>
            ))
          )}
        </tbody>
      </table>
      {hideCount && footer === undefined ? null : (
        <div className="text-muted flex flex-wrap items-center justify-between gap-3 pt-3 text-xs">
          {hideCount ? (
            <span />
          ) : (
            <span>{t("common:table.showing", { shown: sortedRows.length, total })}</span>
          )}
          {footer}
        </div>
      )}
    </div>
  );
}
