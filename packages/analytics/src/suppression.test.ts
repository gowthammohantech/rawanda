import { DEMO_SMALL_CELL_THRESHOLD, mulberry32 } from "@laif/mock-data";
import { describe, expect, it } from "vitest";

import {
  cellAt,
  isPrimarySuppressed,
  shown,
  suppressCells,
  suppressRate,
  suppressValue,
  type CountTable,
  type SuppressedNumber,
} from "./suppression.ts";

const P: SuppressedNumber = { value: null, suppressed: true, reason: "PRIMARY" };
const C: SuppressedNumber = { value: null, suppressed: true, reason: "COMPLEMENTARY" };
const v = (value: number): SuppressedNumber => ({ value, suppressed: false });

const table = (cells: number[][], extra: Partial<CountTable> = {}): CountTable => ({
  rowDimension: "facility_id",
  columnDimension: "metric_id",
  rowKeys: cells.map((_, i) => `r${i}`),
  columnKeys: (cells[0] ?? []).map((_, j) => `c${j}`),
  cells,
  ...extra,
});

describe("primary suppression", () => {
  it("uses threshold 5 from mock-data config", () => {
    expect(DEMO_SMALL_CELL_THRESHOLD).toBe(5);
  });

  it.each([
    [0, false],
    [1, true],
    [4, true],
    [5, false],
    [120, false],
  ])("%i → suppressed %s (zero is shown)", (value, suppressed) => {
    expect(isPrimarySuppressed(value)).toBe(suppressed);
    expect(suppressValue(value)).toEqual(suppressed ? P : v(value));
  });

  it("threshold is overridable", () => {
    expect(suppressValue(7, 10)).toEqual(P);
    expect(suppressValue(1, 1)).toEqual(v(1));
  });

  it("rejects negative or non-finite counts", () => {
    expect(() => suppressValue(-1)).toThrow(RangeError);
    expect(() => suppressCells(table([[Number.NaN]]))).toThrow(RangeError);
    expect(() => suppressCells({ ...table([[1, 2]]), columnKeys: ["only-one"] })).toThrow(
      RangeError,
    );
  });

  it("no totals → primary only", () => {
    const s = suppressCells(table([[3, 0, 9]]));
    expect(s.cells).toEqual([[P, v(0), v(9)]]);
    expect(s.rowTotals).toBeNull();
    expect(s.columnTotals).toBeNull();
    expect(s.grandTotal).toBeNull();
    expect(s.suppressedCount).toBe(1);
    expect(s.threshold).toBe(5);
  });
});

describe("complementary suppression", () => {
  it("suppresses the smallest remaining non-zero cell in a row with a published total", () => {
    const s = suppressCells(table([[2, 0, 9, 7]], { rowTotals: true }));
    expect(s.cells).toEqual([[P, v(0), v(9), C]]);
    expect(s.rowTotals).toEqual([v(18)]);
  });

  it("does nothing when two or more cells in the line are already suppressed", () => {
    const s = suppressCells(table([[2, 3, 9]], { rowTotals: true }));
    expect(s.cells).toEqual([[P, P, v(9)]]);
  });

  it("suppresses the total when only zeros remain (otherwise total − 0 reveals the cell)", () => {
    const s = suppressCells(table([[3, 0, 0]], { rowTotals: true }));
    expect(s.cells).toEqual([[P, v(0), v(0)]]);
    expect(s.rowTotals).toEqual([P]); // total 3 is itself a small cell
    const big = suppressCells(table([[0], [0], [0]], { columnTotals: true }));
    expect(big.columnTotals).toEqual([v(0)]);
    const single = suppressCells(table([[0, 0]], { rowTotals: true, columnTotals: true }));
    expect(single.cells).toEqual([[v(0), v(0)]]);
  });

  it("a one-column table with row totals hides the row total of a suppressed cell", () => {
    const s = suppressCells(table([[2], [8]], { rowTotals: true }));
    expect(s.cells).toEqual([[P], [v(8)]]);
    expect(s.rowTotals).toEqual([P, v(8)]);
  });

  it("cascades across rows and columns until stable (2-D with all totals)", () => {
    //            flagged  not flagged | total
    // alpha-1        9        13      |  22
    // alpha-2        7        11      |  18
    // beta-1         4        13      |  17
    const s = suppressCells(
      table(
        [
          [9, 13],
          [7, 11],
          [4, 13],
        ],
        { rowTotals: true, columnTotals: true },
      ),
    );
    // beta-1 flagged (4) primary; row beta-1 → 13 complementary; column flagged → 7
    // complementary; row alpha-2 → 11 complementary; columns now have 2 hidden each.
    expect(s.cells).toEqual([
      [v(9), v(13)],
      [C, C],
      [P, C],
    ]);
    expect(s.rowTotals).toEqual([v(22), v(18), v(17)]);
    expect(s.columnTotals).toEqual([v(20), v(37)]);
    expect(s.grandTotal).toEqual(v(57));
    expect(s.suppressedCount).toBe(4);
    // Invariant: every published total line hides 0 or ≥ 2 members.
    for (const row of s.cells) expect([0, 2]).toContain(row.filter((c) => c.suppressed).length);
  });

  it("protects totals via the grand total", () => {
    // Row totals 3 (primary) and 10, grand total 13 published → 10 must be hidden too.
    const s = suppressCells(table([[3], [10]], { rowTotals: true, grandTotal: true }));
    expect(s.rowTotals).toEqual([P, C]);
    expect(s.grandTotal).toEqual(v(13));
    expect(s.cells).toEqual([[P], [C]]);
  });

  it("ties pick the first smallest cell", () => {
    const s = suppressCells(table([[1, 6, 6]], { rowTotals: true }));
    expect(s.cells).toEqual([[P, C, v(6)]]);
  });

  it("cellAt looks up by keys", () => {
    const s = suppressCells(table([[1, 6]]));
    expect(cellAt(s, "r0", "c0")).toEqual(P);
    expect(() => cellAt(s, "r9", "c0")).toThrow(RangeError);
  });
});

describe("invariant: no published line hides exactly one node", () => {
  it("holds for 500 deterministic random tables with all totals", () => {
    const rand = mulberry32(20261016);
    for (let t = 0; t < 500; t++) {
      const rows = 1 + Math.floor(rand() * 4);
      const cols = 1 + Math.floor(rand() * 4);
      const cells = Array.from({ length: rows }, () =>
        Array.from({ length: cols }, () => Math.floor(rand() * 12)),
      );
      const s = suppressCells(table(cells, { rowTotals: true, columnTotals: true }));
      const lines: SuppressedNumber[][] = [
        ...s.cells.map((r, i) => [...r, s.rowTotals![i]!]),
        ...s.columnKeys.map((_, j) => [...s.cells.map((r) => r[j]!), s.columnTotals![j]!]),
        [...s.rowTotals!, s.grandTotal!],
        [...s.columnTotals!, s.grandTotal!],
      ];
      for (const line of lines) {
        const hidden = line.filter((n) => n.suppressed).length;
        expect(hidden === 1 && line.some((n) => !n.suppressed && n.value !== 0)).toBe(false);
      }
      // Primary cells are always hidden, zeros never primary.
      cells.forEach((r, i) =>
        r.forEach((value, j) => {
          if (value > 0 && value < 5) expect(s.cells[i]![j]).toEqual(P);
          // Zero is always shown (INDEX decision 6): never primary, never complementary.
          if (value === 0) expect(s.cells[i]![j]).toEqual({ value: 0, suppressed: false });
        }),
      );
    }
  });
});

describe("rates", () => {
  it("are suppressed when the numerator or denominator is suppressed", () => {
    expect(suppressRate(P, v(40))).toEqual(P);
    expect(suppressRate(v(10), C)).toEqual(C);
    expect(suppressRate(v(10), v(40))).toEqual(v(0.25));
    expect(suppressRate(v(1), v(3), 2)).toEqual(v(0.33));
    expect(suppressRate(v(0), v(0))).toEqual({ value: null, suppressed: false });
    expect(shown(null)).toEqual({ value: null, suppressed: false });
  });
});
