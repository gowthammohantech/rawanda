/**
 * `AggregateCell` and `toCells` (ADM-02 task 7) — thin adapters over the FND-06 `suppressCells`
 * (the single primary + complementary implementation; nothing is re-implemented here). Selector
 * outputs that reach admin pages are made of these cells; they carry a key (a facility / district
 * id, a week or a metric id) but never a patient or record identifier.
 */
import {
  DEMO_SMALL_CELL_THRESHOLD,
  suppressCells,
  suppressRate,
  suppressValue,
  type SuppressedNumber,
  type SuppressedTable,
  type SuppressionReason,
} from "./suppression.ts";

export type AggregateCell = {
  /** Row key: facility / district id, ISO week start or a metric id. */
  key: string;
  value: number | null;
  suppressed: boolean;
  reason?: SuppressionReason;
};

export type CellList = {
  cells: AggregateCell[];
  /** Published total over the cells (null when `withTotal` is false). */
  total: AggregateCell | null;
  threshold: number;
  suppressedCount: number;
};

const toAggregate = (key: string, n: SuppressedNumber): AggregateCell =>
  n.reason === undefined
    ? { key, value: n.value, suppressed: n.suppressed }
    : { key, value: n.value, suppressed: n.suppressed, reason: n.reason };

export type ToCellsOptions = {
  /** Publish a total over the values (complementary suppression then protects it). */
  withTotal?: boolean;
  /** Key of the total cell (default `total`). */
  totalKey?: string;
};

/**
 * One column of counts → cells (+ optional total). `values` keeps its order. With a total the
 * complementary rule applies, so no suppressed value can be recovered from the total.
 */
export function toCells(
  values: ReadonlyArray<{ key: string; value: number }>,
  k: number = DEMO_SMALL_CELL_THRESHOLD,
  options: ToCellsOptions = {},
): CellList {
  const table = suppressCells(
    {
      rowDimension: "key",
      columnDimension: "value",
      rowKeys: values.map((v) => v.key),
      columnKeys: ["value"],
      cells: values.map((v) => [v.value]),
      columnTotals: options.withTotal ?? false,
      grandTotal: false,
    },
    k,
  );
  return fromColumn(table, 0, options.totalKey ?? "total");
}

/** Column `c` of a suppressed table as cells (+ its column total when published). */
export function fromColumn(table: SuppressedTable, c: number, totalKey = "total"): CellList {
  const cells = table.rowKeys.map((key, r) =>
    toAggregate(key, table.cells[r]?.[c] as SuppressedNumber),
  );
  const totalNumber = table.columnTotals?.[c];
  const total = totalNumber === undefined ? null : toAggregate(totalKey, totalNumber);
  return {
    cells,
    total,
    threshold: table.threshold,
    suppressedCount: cells.filter((x) => x.suppressed).length + (total?.suppressed ? 1 : 0),
  };
}

/** A single published count (primary suppression only — no table context). */
export function toCell(
  key: string,
  value: number,
  k: number = DEMO_SMALL_CELL_THRESHOLD,
): AggregateCell {
  return toAggregate(key, suppressValue(value, k));
}

/** A value that needs no cell rule itself (e.g. a median), or one hidden with its basis. */
export function derivedCell(
  key: string,
  value: number | null,
  basis?: AggregateCell,
): AggregateCell {
  if (basis?.suppressed) {
    return { key, value: null, suppressed: true, reason: basis.reason ?? "COMPLEMENTARY" };
  }
  return { key, value, suppressed: false };
}

/** Rate cell: suppressed when the numerator or denominator cell is (FND-06 `suppressRate`). */
export function rateCell(
  key: string,
  numerator: AggregateCell,
  denominator: AggregateCell,
  digits = 4,
): AggregateCell {
  return toAggregate(key, suppressRate(numerator, denominator, digits));
}
