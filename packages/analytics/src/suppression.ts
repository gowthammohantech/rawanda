/**
 * Small-cell suppression (FND-06 task 11) — the single implementation; ADM consumes it.
 *
 * Primary: `0 < value < threshold` → suppressed (decision: zero is shown).
 * Complementary: for every published total line (row, column, and the grand total over the row
 * / column totals), if exactly one node of the line (its cells plus its total) is suppressed,
 * also suppress the smallest remaining non-zero cell (first in order on ties); if no non-zero
 * cell remains, the total itself is suppressed. Repeated until stable, so suppressed values
 * never leak via totals (nor a suppressed total via its fully shown cells).
 * Rates whose numerator or denominator is suppressed are suppressed.
 *
 * Threshold: `DEMO_SMALL_CELL_THRESHOLD` (mock-data config, pending data-governance approval),
 * overridable for tests.
 */
import { DEMO_SMALL_CELL_THRESHOLD } from "@laif/mock-data";

export { DEMO_SMALL_CELL_THRESHOLD };

export type SuppressionReason = "PRIMARY" | "COMPLEMENTARY";

export type SuppressedNumber = {
  value: number | null;
  suppressed: boolean;
  reason?: SuppressionReason;
};

/** Rows × columns of non-negative counts. */
export type CountTable = {
  /** Machine name of the row dimension, e.g. `facility_id`. */
  rowDimension: string;
  /** Machine name of the column dimension, e.g. `metric_id`. */
  columnDimension: string;
  rowKeys: readonly string[];
  columnKeys: readonly string[];
  /** `cells[row][column]`. */
  cells: ReadonlyArray<readonly number[]>;
  /** Publish one total per row. */
  rowTotals?: boolean;
  /** Publish one total per column. */
  columnTotals?: boolean;
  /** Publish the grand total (defaults to true when both row and column totals are shown). */
  grandTotal?: boolean;
};

export type SuppressedTable = {
  rowDimension: string;
  columnDimension: string;
  rowKeys: string[];
  columnKeys: string[];
  cells: SuppressedNumber[][];
  rowTotals: SuppressedNumber[] | null;
  columnTotals: SuppressedNumber[] | null;
  grandTotal: SuppressedNumber | null;
  threshold: number;
  /** Suppressed cells + totals (CSV trailer, UI legend). */
  suppressedCount: number;
};

function assertCount(value: number): void {
  if (!Number.isFinite(value) || value < 0) {
    throw new RangeError(`suppression expects non-negative finite counts, got ${value}`);
  }
}

export function isPrimarySuppressed(value: number, threshold = DEMO_SMALL_CELL_THRESHOLD): boolean {
  return value > 0 && value < threshold;
}

/** Primary suppression of a single published number (no table context). */
export function suppressValue(
  value: number,
  threshold = DEMO_SMALL_CELL_THRESHOLD,
): SuppressedNumber {
  assertCount(value);
  return isPrimarySuppressed(value, threshold)
    ? { value: null, suppressed: true, reason: "PRIMARY" }
    : { value, suppressed: false };
}

/** A published (never suppressed) number, e.g. a rate or median that needs no cell rule. */
export const shown = (value: number | null): SuppressedNumber => ({ value, suppressed: false });

/**
 * Rate `numerator / denominator` (rounded to `digits`); suppressed when either side is.
 * A zero denominator yields `{ value: null, suppressed: false }` (nothing to show, nothing hidden).
 */
export function suppressRate(
  numerator: SuppressedNumber,
  denominator: SuppressedNumber,
  digits = 4,
): SuppressedNumber {
  if (numerator.suppressed || denominator.suppressed) {
    const reason = numerator.reason ?? denominator.reason ?? "COMPLEMENTARY";
    return { value: null, suppressed: true, reason };
  }
  if (numerator.value === null || denominator.value === null || denominator.value === 0) {
    return { value: null, suppressed: false };
  }
  const factor = 10 ** digits;
  return {
    value: Math.round((numerator.value / denominator.value) * factor) / factor,
    suppressed: false,
  };
}

type Node = { raw: number; suppressed: boolean; reason?: SuppressionReason };
type Line = { members: Node[]; total: Node };

const toOutput = (n: Node): SuppressedNumber =>
  n.suppressed
    ? { value: null, suppressed: true, reason: n.reason ?? "PRIMARY" }
    : { value: n.raw, suppressed: false };

export function suppressCells(
  table: CountTable,
  threshold: number = DEMO_SMALL_CELL_THRESHOLD,
): SuppressedTable {
  const rows = table.rowKeys.length;
  const cols = table.columnKeys.length;
  if (table.cells.length !== rows || table.cells.some((r) => r.length !== cols)) {
    throw new RangeError("cells must be rows × columns");
  }
  const node = (raw: number): Node => {
    assertCount(raw);
    return isPrimarySuppressed(raw, threshold)
      ? { raw, suppressed: true, reason: "PRIMARY" }
      : { raw, suppressed: false };
  };

  const grid: Node[][] = table.cells.map((r) => r.map(node));
  const sum = (ns: readonly Node[]): number => ns.reduce((a, n) => a + n.raw, 0);
  const rowTotals = table.rowTotals ? grid.map((r) => node(sum(r))) : null;
  const columnTotals = table.columnTotals
    ? table.columnKeys.map((_, c) => node(sum(grid.map((r) => r[c] as Node))))
    : null;
  const showGrand = table.grandTotal ?? (rowTotals !== null && columnTotals !== null);
  const grand = showGrand ? node(sum(grid.flat())) : null;

  const lines: Line[] = [];
  if (rowTotals) grid.forEach((r, i) => lines.push({ members: r, total: rowTotals[i] as Node }));
  if (columnTotals) {
    columnTotals.forEach((total, c) =>
      lines.push({ members: grid.map((r) => r[c] as Node), total }),
    );
  }
  if (grand) {
    if (rowTotals) lines.push({ members: rowTotals, total: grand });
    if (columnTotals) lines.push({ members: columnTotals, total: grand });
  }

  // A line leaks when exactly one of its nodes (cells + total) is hidden: the hidden value is
  // the total minus the shown cells, or the sum of the shown cells.
  for (let changed = true; changed;) {
    changed = false;
    for (const line of lines) {
      const hidden =
        line.members.filter((n) => n.suppressed).length + (line.total.suppressed ? 1 : 0);
      if (hidden !== 1) continue;
      let pick: Node | undefined;
      for (const n of line.members) {
        if (!n.suppressed && n.raw > 0 && (pick === undefined || n.raw < pick.raw)) pick = n;
      }
      // No non-zero cell left: hide the total (a hidden total over all-zero cells stays: 0 is shown).
      const target = pick ?? (line.total.suppressed ? undefined : line.total);
      if (target === undefined) continue;
      target.suppressed = true;
      target.reason = "COMPLEMENTARY";
      changed = true;
    }
  }

  const all = [
    ...grid.flat(),
    ...(rowTotals ?? []),
    ...(columnTotals ?? []),
    ...(grand ? [grand] : []),
  ];
  return {
    rowDimension: table.rowDimension,
    columnDimension: table.columnDimension,
    rowKeys: [...table.rowKeys],
    columnKeys: [...table.columnKeys],
    cells: grid.map((r) => r.map(toOutput)),
    rowTotals: rowTotals ? rowTotals.map(toOutput) : null,
    columnTotals: columnTotals ? columnTotals.map(toOutput) : null,
    grandTotal: grand ? toOutput(grand) : null,
    threshold,
    suppressedCount: all.filter((n) => n.suppressed).length,
  };
}

/** Cell lookup by keys (UI selectors). */
export function cellAt(
  table: SuppressedTable,
  rowKey: string,
  columnKey: string,
): SuppressedNumber {
  const r = table.rowKeys.indexOf(rowKey);
  const c = table.columnKeys.indexOf(columnKey);
  const cell = table.cells[r]?.[c];
  if (cell === undefined) throw new RangeError(`no cell ${rowKey} × ${columnKey}`);
  return cell;
}
