/**
 * ADM-03 funnel over the ADM-02 dataset: exact fixture values, equality with the overview
 * counters, monotonicity on the seed, the dismissed branch, suppression propagation, the
 * view-consistent hierarchy and `largestDrop` ties.
 */
import {
  adminMetricsFixture,
  ADMIN_METRICS_FIXTURE_NOW,
  ADMIN_METRICS_FIXTURE_PERIOD,
  createSeed,
  DISTRICT_IDS,
  FACILITY_IDS,
  sliceForApp,
} from "@laif/mock-data";
import { describe, expect, it } from "vitest";

import type { AggregateCell } from "./aggregate-cells.ts";
import { filterDataset, type MetricsDataset, type MetricsRecords } from "./dataset.ts";
import {
  computeFunnel,
  FUNNEL_COLUMNS,
  FUNNEL_STAGES,
  funnelByGroup,
  funnelCountsByGroup,
  funnelHierarchy,
  largestDrop,
  type FunnelHierarchy,
} from "./metrics/funnel.ts";
import {
  countDismissed,
  countFlagged,
  countFollowUpCompleted,
  countReferred,
  countReviewed,
  countScreened,
} from "./metrics/screening-overview.ts";
import { suppressLines } from "./suppression.ts";

const now = new Date(ADMIN_METRICS_FIXTURE_NOW);
const fixtureDs = () => filterDataset(adminMetricsFixture(), ADMIN_METRICS_FIXTURE_PERIOD, now);

const slice = sliceForApp(createSeed(), "admin");
const records: MetricsRecords = {
  ...slice,
  timeEntries: (slice.extraCollections["timeEntries"] ?? []) as MetricsRecords["timeEntries"],
};
const seedNow = new Date("2026-10-14T06:00:00.000Z");
const seedDs = (districtIds?: string[]) =>
  filterDataset(
    records,
    {
      from: "2026-07-17",
      to: "2026-10-14",
      ...(districtIds === undefined ? {} : { districtIds: districtIds as never }),
    },
    seedNow,
  );

const n = (funnel: ReturnType<typeof computeFunnel>) => funnel.stages.map((s) => s.n);

describe("computeFunnel on adminMetricsFixture", () => {
  const funnel = computeFunnel(fixtureDs());

  it("exact stage values, % of previous (pathway) and % of recorded", () => {
    expect(funnel.stages).toEqual([
      { id: "recorded", n: 10, pctOfPrevious: null, pctOfRecorded: 1 },
      { id: "flagged", n: 6, pctOfPrevious: 0.6, pctOfRecorded: 0.6 },
      { id: "reviewed", n: 5, pctOfPrevious: 0.8333, pctOfRecorded: 0.5 },
      // Denominator = reviewed − dismissed = 4 (reviews with action recorded).
      { id: "referred", n: 3, pctOfPrevious: 0.75, pctOfRecorded: 0.3 },
      { id: "completed", n: 2, pctOfPrevious: 0.6667, pctOfRecorded: 0.2 },
    ]);
    expect(funnel.dismissed).toEqual({ n: 1, pctOfReviewed: 0.2 });
  });

  it("largest drop = the lowest % of previous", () => {
    expect(largestDrop(funnel)).toEqual({ id: "flagged", pctOfPrevious: 0.6 });
  });

  it("group-by facility / district / week partitions every column", () => {
    const ds = fixtureDs();
    for (const by of ["facility", "district", "week"] as const) {
      const rows = funnelCountsByGroup(ds, by);
      for (const [i, c] of FUNNEL_COLUMNS.entries()) {
        const total = c === "dismissed" ? funnel.dismissed.n : funnel.stages[i]?.n;
        expect(
          rows.reduce((a, r) => a + r.counts[c], 0),
          `${by} ${c}`,
        ).toBe(total);
      }
    }
    expect(funnelCountsByGroup(ds, "week").map((r) => [r.key, r.counts.recorded])).toEqual([
      ["2026-09-28", 3],
      ["2026-10-05", 7],
      ["2026-10-12", 0],
    ]);
    expect(
      funnelCountsByGroup(ds, "facility").find((r) => r.key === FACILITY_IDS.alpha1)?.counts,
    ).toEqual({ recorded: 8, flagged: 5, reviewed: 5, referred: 3, completed: 2, dismissed: 1 });
  });
});

describe("computeFunnel on the admin seed slice", () => {
  const ds = seedDs();
  const funnel = computeFunnel(ds);

  it("recorded … completed equal the overview counters (same dataset)", () => {
    expect(n(funnel)).toEqual([
      countScreened(ds),
      countFlagged(ds),
      countReviewed(ds),
      countReferred(ds),
      countFollowUpCompleted(ds),
    ]);
    expect(funnel.dismissed.n).toBe(countDismissed(ds));
  });

  it("is monotonically non-increasing; referred ≤ reviewed − dismissed", () => {
    const counts = n(funnel);
    for (let i = 1; i < counts.length; i += 1) {
      expect(counts[i]).toBeLessThanOrEqual(counts[i - 1] as number);
    }
    expect(funnel.stages[3]!.n).toBeLessThanOrEqual(funnel.stages[2]!.n - funnel.dismissed.n);
    expect(funnel.stages.every((s) => s.pctOfPrevious === null || s.pctOfPrevious <= 1)).toBe(true);
  });

  it("dismissed branch: District Alpha's seeded dismissals, never in referred / completed", () => {
    const alpha = seedDs([DISTRICT_IDS.alpha]);
    const naive = alpha.cohort.reviews.filter((r) => r.status === "dismissed_with_reason");
    const dismissedScreenings = new Set(naive.map((r) => r.screeningId));
    expect(computeFunnel(alpha).dismissed.n).toBe(dismissedScreenings.size);
    expect(dismissedScreenings.size).toBeGreaterThan(0);
    const referredReviews = new Set(
      alpha.cohort.referrals
        .filter((r) => r.status !== "cancelled_with_reason")
        .map((r) => r.reviewId),
    );
    for (const review of naive) expect(referredReviews.has(review.id)).toBe(false);
  });
});

describe("funnelByGroup suppression", () => {
  it("complementary per column; a suppressed count suppresses its downstream percentages", () => {
    const g = funnelByGroup(fixtureDs(), "facility", 5);
    const a1 = g.rows.find((r) => r.key === FACILITY_IDS.alpha1)!;
    const a2 = g.rows.find((r) => r.key === FACILITY_IDS.alpha2)!;
    // a2 recorded = 2 → primary; a1 recorded (8) hidden so the total (10) does not reveal it.
    expect(a2.cells.recorded).toMatchObject({ suppressed: true, reason: "PRIMARY" });
    expect(a1.cells.recorded).toMatchObject({ suppressed: true, reason: "COMPLEMENTARY" });
    expect(g.totals.recorded).toMatchObject({ value: 10, suppressed: false });
    // Rates over a hidden count are hidden.
    expect(a1.pctOfPrevious.flagged.suppressed).toBe(true);
    expect(a1.pctOfRecorded.reviewed.suppressed).toBe(true);
    // reviewed 5 is shown but its denominator (flagged, hidden) is not → hidden.
    expect(a1.cells.reviewed).toMatchObject({ value: 5, suppressed: false });
    expect(a1.pctOfPrevious.reviewed.suppressed).toBe(true);
    // referred = 3 (<5): its rate and the completed rate (denominator) are hidden.
    expect(a1.cells.referred.suppressed).toBe(true);
    expect(a1.pctOfPrevious.referred.suppressed).toBe(true);
    expect(a1.pctOfPrevious.completed.suppressed).toBe(true);
    // Zero is shown.
    const beta = g.rows.find((r) => r.key === FACILITY_IDS.beta1)!;
    expect(beta.cells.recorded).toEqual({ key: "recorded", value: 0, suppressed: false });
    expect(beta.pctOfPrevious.flagged).toMatchObject({ value: null, suppressed: false });
  });

  it("with threshold 1 nothing is hidden and rates equal computeFunnel", () => {
    const g = funnelByGroup(fixtureDs(), "district", 1);
    const alpha = g.rows.find((r) => r.key === DISTRICT_IDS.alpha)!;
    expect(alpha.pctOfPrevious.referred.value).toBe(0.75);
    expect(g.suppressedCount).toBe(0);
  });
});

/** Every published additive line of the hierarchy hides 0 or ≥ 2 of its nodes. */
function expectNoSingleHidden(h: FunnelHierarchy) {
  const hidden = (cells: AggregateCell[]) => cells.filter((c) => c.suppressed).length;
  for (const c of FUNNEL_COLUMNS) {
    const top = [...h.districts.map((d) => d.cells[c]), h.root.cells[c]];
    expect(hidden(top), `root ${c}`).not.toBe(1);
    for (const d of h.districts) {
      expect(
        hidden([...d.facilities.map((f) => f.cells[c]), d.cells[c]]),
        `${d.key} ${c}`,
      ).not.toBe(1);
      for (const f of d.facilities) {
        expect(hidden([...f.weekly.map((w) => w[c]), f.cells[c]]), `${f.key} ${c}`).not.toBe(1);
      }
    }
  }
}

describe("funnelHierarchy (one suppression pass for every funnel view)", () => {
  it("raw values reconcile and no line leaks (fixture, k = 5)", () => {
    const ds = fixtureDs();
    const h = funnelHierarchy(ds, 5);
    expect(h.weeks).toEqual(["2026-09-28", "2026-10-05", "2026-10-12"]);
    expect(h.root.cells.recorded).toMatchObject({ value: 10, suppressed: false });
    expectNoSingleHidden(h);
    // Primary cells are hidden everywhere.
    const alpha = h.districts.find((d) => d.key === DISTRICT_IDS.alpha)!;
    const a2 = alpha.facilities.find((f) => f.key === FACILITY_IDS.alpha2)!;
    expect(a2.cells.recorded.suppressed).toBe(true);
    expect(a2.weekly.map((w) => w.recorded.suppressed)).toEqual([true, true, false]);
  });

  it("seed, all districts: no leak; unsuppressed facility values + markers reconcile", () => {
    const h = funnelHierarchy(seedDs(), 5);
    expectNoSingleHidden(h);
    for (const stage of FUNNEL_STAGES) {
      for (const d of h.districts) {
        const shown = d.facilities.filter((f) => !f.cells[stage].suppressed);
        if (!d.cells[stage].suppressed && shown.length === d.facilities.length) {
          expect(shown.reduce((a, f) => a + (f.cells[stage].value ?? 0), 0)).toBe(
            d.cells[stage].value,
          );
        }
      }
    }
  });

  it("a district view takes its cells from the scope-wide pass (no differencing)", () => {
    const h = funnelHierarchy(seedDs(), 5);
    const beta = h.districts.find((d) => d.key === DISTRICT_IDS.beta)!;
    const alpha = h.districts.find((d) => d.key === DISTRICT_IDS.alpha)!;
    // Beta completed is small → hidden; then Alpha's completed is hidden too, so
    // "all districts − District Alpha" cannot reveal District Beta.
    expect(beta.cells.completed.suppressed).toBe(true);
    expect(alpha.cells.completed.suppressed).toBe(true);
    expect(h.root.cells.completed.suppressed).toBe(false);
  });
});

describe("largestDrop", () => {
  const stage = (id: (typeof FUNNEL_STAGES)[number], pctOfPrevious: number | null) => ({
    id,
    pctOfPrevious,
  });

  it("ties go to the earlier stage; null rates are skipped", () => {
    expect(
      largestDrop({
        stages: [
          stage("recorded", null),
          stage("flagged", 0.5),
          stage("reviewed", 0.9),
          stage("referred", 0.5),
          stage("completed", null),
        ],
      }),
    ).toEqual({ id: "flagged", pctOfPrevious: 0.5 });
    expect(largestDrop({ stages: [stage("recorded", null)] })).toBeNull();
  });

  it("works on an empty dataset (zeros, no rates)", () => {
    const empty: MetricsDataset = filterDataset(
      adminMetricsFixture(),
      { from: "2000-01-01", to: "2000-01-31" },
      now,
    );
    const funnel = computeFunnel(empty);
    expect(n(funnel)).toEqual([0, 0, 0, 0, 0]);
    expect(largestDrop(funnel)).toBeNull();
  });
});

describe("suppressLines", () => {
  it("shares nodes across lines and rejects inconsistent totals", () => {
    const values = new Map([
      ["a", 2],
      ["b", 10],
      ["t", 12],
      ["w1", 1],
      ["w2", 9],
    ]);
    const out = suppressLines(
      values,
      [
        { members: ["a", "b"], total: "t" },
        { members: ["w1", "w2"], total: "b" },
      ],
      5,
    );
    expect(out.get("a")).toMatchObject({ suppressed: true, reason: "PRIMARY" });
    // b hidden (line a+b=t) → then line w1+w2=b has w1 (primary) + b hidden = 2 → stable.
    expect(out.get("b")).toMatchObject({ suppressed: true, reason: "COMPLEMENTARY" });
    expect(out.get("w2")).toMatchObject({ value: 9, suppressed: false });
    expect(() => suppressLines(values, [{ members: ["a"], total: "t" }], 5)).toThrow(RangeError);
  });
});
