/**
 * Pathway funnel (FND-06 task 7), extended in place by ADM-03 (`computeFunnel` with
 * `pctOfRecorded`, `largestDrop`, `funnelByGroup`, `funnelHierarchy` — see the section below).
 *
 * recorded  = submitted (non-draft) screenings
 * flagged   = recorded with status `review_required`
 * reviewed  = flagged whose review is `action_recorded` or `dismissed_with_reason`
 * referred  = flagged whose review is `action_recorded` with ≥1 non-cancelled referral or ≥1
 *             follow-up (FRD `REFERRAL_OPEN | FOLLOW_UP_PLANNED`)
 * completed = of referred: a referral completed with evidence, or a follow-up completed with
 *             outcome + evidence
 * dismissed = flagged whose review is `dismissed_with_reason` — reported separately (WF-03
 *             step 4) and never counted as completed.
 */
import type { Screening, ScreeningId } from "@laif/domain";

import { derivedCell, fromColumn, rateCell, type AggregateCell } from "../aggregate-cells.ts";
import { isoWeeksBetween, type MetricsDataset } from "../dataset.ts";
import { applyMetricsFilter, kigaliDate, kigaliIsoWeekStart } from "../filters.ts";
import type { MetricKey } from "../metric-keys.ts";
import {
  DEMO_SMALL_CELL_THRESHOLD,
  suppressCells,
  suppressLines,
  type SuppressedNumber,
  type SuppressionLine,
} from "../suppression.ts";
import type { AnalyticsInput, MetricsFilter, Rate } from "../types.ts";
// Function-only import (cycle-safe): screening-overview imports `classifyPathway` from here.
import { followUpCompletedScreeningIds } from "./screening-overview.ts";
import {
  groupBy,
  isFlagged,
  isFollowUpCompletedWithEvidence,
  isRecorded,
  isReferralCompletedWithEvidence,
  isReviewDecided,
  rate,
} from "./shared.ts";

export const FUNNEL_STAGES = ["recorded", "flagged", "reviewed", "referred", "completed"] as const;
export type FunnelStageName = (typeof FUNNEL_STAGES)[number];

export const FUNNEL_STAGE_METRIC_KEYS = {
  recorded: "screenings_recorded",
  flagged: "screenings_flagged",
  reviewed: "reviews_completed",
  referred: "pathway_referred",
  completed: "pathway_completed",
} as const satisfies Record<FunnelStageName, MetricKey>;

export type FunnelStage = {
  stage: FunnelStageName;
  metricKey: MetricKey;
  count: number;
  /** count / previous stage count (null for `recorded` or an empty previous stage). */
  rateFromPrevious: Rate;
};

export type PathwayFunnel = {
  stages: FunnelStage[];
  dismissed: { metricKey: "reviews_dismissed"; count: number; rateFromFlagged: Rate };
};

/** Screening ids per stage (internal sets for drill-down / extensions; not a result type). */
export type PathwayClassification = Record<FunnelStageName | "dismissed", Set<ScreeningId>>;

/** Classifies an (already filtered) input. */
export function classifyPathway(data: AnalyticsInput): PathwayClassification {
  const reviewsByScreening = groupBy(data.reviews, (r) => r.screeningId);
  const referralsByReview = groupBy(data.referrals, (r) => r.reviewId);
  const followUpsByReview = groupBy(
    data.followUps.filter((f) => f.reviewId !== null),
    (f) => f.reviewId,
  );
  const followUpsByReferral = groupBy(
    data.followUps.filter((f) => f.referralId !== null),
    (f) => f.referralId,
  );

  const out: PathwayClassification = {
    recorded: new Set(),
    flagged: new Set(),
    reviewed: new Set(),
    referred: new Set(),
    completed: new Set(),
    dismissed: new Set(),
  };

  for (const s of data.screenings) {
    if (!isRecorded(s)) continue;
    out.recorded.add(s.id);
    if (!isFlagged(s)) continue;
    out.flagged.add(s.id);
    const reviews = reviewsByScreening.get(s.id) ?? [];
    if (reviews.some(isReviewDecided)) out.reviewed.add(s.id);
    if (reviews.some((r) => r.status === "dismissed_with_reason")) out.dismissed.add(s.id);

    let referred = false;
    let completed = false;
    for (const review of reviews) {
      if (review.status !== "action_recorded") continue;
      const referrals = (referralsByReview.get(review.id) ?? []).filter(
        (r) => r.status !== "cancelled_with_reason",
      );
      const followUps = [
        ...(followUpsByReview.get(review.id) ?? []),
        ...referrals.flatMap((r) => followUpsByReferral.get(r.id) ?? []),
      ];
      if (referrals.length > 0 || followUps.length > 0) referred = true;
      if (
        referrals.some(isReferralCompletedWithEvidence) ||
        followUps.some(isFollowUpCompletedWithEvidence)
      ) {
        completed = true;
      }
    }
    if (referred) out.referred.add(s.id);
    if (referred && completed) out.completed.add(s.id);
  }
  return out;
}

export function pathwayFunnel(
  data: AnalyticsInput,
  filter: MetricsFilter,
  now: Date,
): PathwayFunnel {
  void now; // stage membership does not depend on time; kept for the uniform signature.
  const sets = classifyPathway(applyMetricsFilter(data, filter));
  let previous: number | null = null;
  const stages = FUNNEL_STAGES.map((stage): FunnelStage => {
    const count = sets[stage].size;
    const result: FunnelStage = {
      stage,
      metricKey: FUNNEL_STAGE_METRIC_KEYS[stage],
      count,
      rateFromPrevious: previous === null ? null : rate(count, previous),
    };
    previous = count;
    return result;
  });
  return {
    stages,
    dismissed: {
      metricKey: "reviews_dismissed",
      count: sets.dismissed.size,
      rateFromFlagged: rate(sets.dismissed.size, sets.flagged.size),
    },
  };
}

/** Convenience: stage count by name. */
export function funnelCount(funnel: PathwayFunnel, stage: FunnelStageName): number {
  return funnel.stages.find((s) => s.stage === stage)?.count ?? 0;
}

// ── ADM-03: computeFunnel, largestDrop, funnelByGroup, funnelHierarchy over a `MetricsDataset` ──
//
// Stages over the ADM-02 dataset (same attribution as the overview, so `recorded` / `flagged` /
// … equal `countScreened` / `countFlagged` / … for the same filters):
//   recorded  = countScreened            flagged  = countFlagged
//   reviewed  = countReviewed            dismissed = countDismissed (branch under reviewed)
//   referred  = countReferred (`classifyPathway`)
//   completed = countFollowUpCompleted limited to `referred`
// Conversion uses the previous PATHWAY stage; for `referred` the denominator is
// `reviewed − dismissed` (reviews with action recorded). Dismissals are never in referred /
// completed (WF-03).

/** Stage ids of the five-stage pathway (`FUNNEL_STAGES`). */
export type FunnelStageId = FunnelStageName;

/** Counted columns: the five stages + the dismissed branch. */
export const FUNNEL_COLUMNS = [...FUNNEL_STAGES, "dismissed"] as const;
export type FunnelColumn = (typeof FUNNEL_COLUMNS)[number];

export function isFunnelStageId(value: string): value is FunnelStageId {
  return (FUNNEL_STAGES as readonly string[]).includes(value);
}

export type FunnelCounts = Record<FunnelColumn, number>;

/** Screening ids per column over the dataset cohort (internal: never leaves a selector). */
export function funnelScreeningSets(ds: MetricsDataset): Record<FunnelColumn, Set<ScreeningId>> {
  const pathway = classifyPathway(ds.cohort);
  const followedUp = followUpCompletedScreeningIds(ds);
  return {
    recorded: pathway.recorded,
    flagged: pathway.flagged,
    reviewed: pathway.reviewed,
    referred: pathway.referred,
    completed: new Set([...pathway.referred].filter((id) => followedUp.has(id))),
    dismissed: pathway.dismissed,
  };
}

const countsOfSets = (sets: Record<FunnelColumn, Set<ScreeningId>>): FunnelCounts =>
  Object.fromEntries(FUNNEL_COLUMNS.map((c) => [c, sets[c].size])) as FunnelCounts;

/** Denominator of a stage's "% of previous" (null for `recorded`). */
export function previousStageCount(counts: FunnelCounts, stage: FunnelStageId): number | null {
  switch (stage) {
    case "recorded":
      return null;
    case "flagged":
      return counts.recorded;
    case "reviewed":
      return counts.flagged;
    case "referred":
      return counts.reviewed - counts.dismissed;
    case "completed":
      return counts.referred;
  }
}

export type ComputedFunnelStage = {
  id: FunnelStageId;
  n: number;
  pctOfPrevious: Rate;
  pctOfRecorded: Rate;
};

export type ComputedFunnel = {
  stages: ComputedFunnelStage[];
  dismissed: { n: number; pctOfReviewed: Rate };
};

export function funnelFromCounts(counts: FunnelCounts): ComputedFunnel {
  return {
    stages: FUNNEL_STAGES.map((id) => {
      const previous = previousStageCount(counts, id);
      return {
        id,
        n: counts[id],
        pctOfPrevious: previous === null ? null : rate(counts[id], previous),
        pctOfRecorded: rate(counts[id], counts.recorded),
      };
    }),
    dismissed: { n: counts.dismissed, pctOfReviewed: rate(counts.dismissed, counts.reviewed) },
  };
}

/** `{ stages: [{ id, n, pctOfPrevious, pctOfRecorded }], dismissed: { n, pctOfReviewed } }`. */
export function computeFunnel(ds: MetricsDataset): ComputedFunnel {
  return funnelFromCounts(countsOfSets(funnelScreeningSets(ds)));
}

/**
 * The stage with the lowest `pctOfPrevious` (ties → the earlier stage); stages without a rate
 * (`recorded`, an empty or suppressed denominator) are skipped. Null when no stage has a rate.
 */
export function largestDrop<S extends { id: FunnelStageId; pctOfPrevious: Rate }>(funnel: {
  stages: readonly S[];
}): { id: FunnelStageId; pctOfPrevious: number } | null {
  let best: { id: FunnelStageId; pctOfPrevious: number } | null = null;
  for (const stage of funnel.stages) {
    if (stage.pctOfPrevious === null) continue;
    if (best === null || stage.pctOfPrevious < best.pctOfPrevious) {
      best = { id: stage.id, pctOfPrevious: stage.pctOfPrevious };
    }
  }
  return best;
}

export type FunnelGroupBy = "district" | "facility" | "week";

/** Group keys in reference order (weeks: Kigali ISO weeks of the period). */
function groupKeys(ds: MetricsDataset, by: FunnelGroupBy): string[] {
  if (by === "district") return ds.cohort.districts.map((d) => d.id);
  if (by === "facility") return ds.cohort.facilities.map((f) => f.id);
  const days = ds.cohort.screenings.map((s) => kigaliDate(s.measuredAt)).sort();
  const from = ds.filter.from ?? days[0];
  const to = ds.filter.to ?? days[days.length - 1];
  return from === undefined || to === undefined ? [] : isoWeeksBetween(from, to);
}

function groupOf(by: FunnelGroupBy, s: Screening): string {
  if (by === "district") return s.districtId;
  if (by === "facility") return s.facilityId;
  return kigaliIsoWeekStart(s.measuredAt);
}

/** Raw counts per group (inputs of the suppressed outputs; tests and reconciliation). */
export function funnelCountsByGroup(
  ds: MetricsDataset,
  by: FunnelGroupBy,
): Array<{ key: string; counts: FunnelCounts }> {
  const sets = funnelScreeningSets(ds);
  const keys = groupKeys(ds, by);
  const index = new Map(keys.map((k, i) => [k, i]));
  const rows = keys.map((key) => ({
    key,
    counts: Object.fromEntries(FUNNEL_COLUMNS.map((c) => [c, 0])) as FunnelCounts,
  }));
  for (const s of ds.cohort.screenings) {
    const i = index.get(groupOf(by, s));
    if (i === undefined) continue;
    const row = rows[i] as (typeof rows)[number];
    for (const c of FUNNEL_COLUMNS) if (sets[c].has(s.id)) row.counts[c] += 1;
  }
  return rows;
}

/** Rate cells of one funnel row (each follows its numerator and denominator cells). */
export type FunnelRateCells = {
  pctOfPrevious: Record<FunnelStageId, AggregateCell>;
  pctOfRecorded: Record<FunnelStageId, AggregateCell>;
  dismissedOfReviewed: AggregateCell;
};

/**
 * Rates of a row of (suppressed) count cells. A suppressed stage count suppresses its own rates
 * and every rate that uses it as a denominator; `reviewed − dismissed` (the `referred`
 * denominator) is suppressed when either part is.
 */
export function funnelRateCells(cells: Record<FunnelColumn, AggregateCell>): FunnelRateCells {
  const actioned = (() => {
    const { reviewed, dismissed } = cells;
    if (reviewed.suppressed || dismissed.suppressed) {
      return derivedCell("actioned", null, reviewed.suppressed ? reviewed : dismissed);
    }
    return {
      key: "actioned",
      value:
        reviewed.value === null || dismissed.value === null
          ? null
          : reviewed.value - dismissed.value,
      suppressed: false,
    } satisfies AggregateCell;
  })();
  const denominator: Record<FunnelStageId, AggregateCell | null> = {
    recorded: null,
    flagged: cells.recorded,
    reviewed: cells.flagged,
    referred: actioned,
    completed: cells.referred,
  };
  const none: AggregateCell = { key: "none", value: null, suppressed: false };
  return {
    pctOfPrevious: Object.fromEntries(
      FUNNEL_STAGES.map((id) => {
        const den = denominator[id];
        return [id, den === null ? { ...none, key: id } : rateCell(id, cells[id], den)];
      }),
    ) as Record<FunnelStageId, AggregateCell>,
    pctOfRecorded: Object.fromEntries(
      FUNNEL_STAGES.map((id) => [id, rateCell(id, cells[id], cells.recorded)]),
    ) as Record<FunnelStageId, AggregateCell>,
    dismissedOfReviewed: rateCell("dismissedOfReviewed", cells.dismissed, cells.reviewed),
  };
}

export type FunnelGroupRow = {
  key: string;
  cells: Record<FunnelColumn, AggregateCell>;
} & FunnelRateCells;

export type FunnelByGroup = {
  by: FunnelGroupBy;
  rows: FunnelGroupRow[];
  /** Published column (stage) totals over the rows. */
  totals: Record<FunnelColumn, AggregateCell>;
  threshold: number;
  suppressedCount: number;
};

/**
 * Groups × (stages + dismissed) as `AggregateCell`s: FND-06 `suppressCells` with column totals
 * (complementary per column), rates per row via `funnelRateCells` (a suppressed stage count
 * suppresses its downstream percentages).
 */
export function funnelByGroup(
  ds: MetricsDataset,
  by: FunnelGroupBy,
  threshold: number = DEMO_SMALL_CELL_THRESHOLD,
): FunnelByGroup {
  const raw = funnelCountsByGroup(ds, by);
  const table = suppressCells(
    {
      rowDimension: `${by}_id`,
      columnDimension: "funnel_stage",
      rowKeys: raw.map((r) => r.key),
      columnKeys: [...FUNNEL_COLUMNS],
      cells: raw.map((r) => FUNNEL_COLUMNS.map((c) => r.counts[c])),
      columnTotals: true,
      grandTotal: false,
    },
    threshold,
  );
  const columns = FUNNEL_COLUMNS.map((c, i) => [c, fromColumn(table, i, c)] as const);
  const rows = raw.map((r, ri): FunnelGroupRow => {
    const cells = Object.fromEntries(
      columns.map(([c, list]) => [c, { ...(list.cells[ri] as AggregateCell), key: c }]),
    ) as Record<FunnelColumn, AggregateCell>;
    return { key: r.key, cells, ...funnelRateCells(cells) };
  });
  return {
    by,
    rows,
    totals: Object.fromEntries(columns.map(([c, list]) => [c, list.total])) as Record<
      FunnelColumn,
      AggregateCell
    >,
    threshold,
    suppressedCount: table.suppressedCount,
  };
}

export type FunnelNode = {
  key: string;
  cells: Record<FunnelColumn, AggregateCell>;
} & FunnelRateCells;

export type FunnelFacilityNode = FunnelNode & {
  districtId: string;
  /** Per Kigali ISO week (`FunnelHierarchy.weeks` order), each column. */
  weekly: Array<Record<FunnelColumn, AggregateCell>>;
};

export type FunnelDistrictNode = FunnelNode & { facilities: FunnelFacilityNode[] };

export type FunnelHierarchy = {
  threshold: number;
  /** Every facility / district of the dataset scope. */
  root: FunnelNode;
  districts: FunnelDistrictNode[];
  weeks: string[];
  suppressedCount: number;
};

/**
 * View-consistent suppression for the funnel and its drill-downs (ADM-03; closes the ADM-02
 * "differencing across views" gap for these pages): ONE suppression pass over the whole dataset
 * scope — facility → district → programme for every column, plus each facility's weekly series
 * summing to its count — through `suppressLines`. Narrower views (one district, one facility,
 * one stage, the weekly trend) pick their cells from this single result instead of suppressing
 * their own subset, so no two views of the same period disagree on which values are hidden and
 * no hidden value can be recovered by subtracting one view from another. Load the dataset for the
 * actor's full grant scope and filter the presentation, never the suppression.
 */
export function funnelHierarchy(
  ds: MetricsDataset,
  threshold: number = DEMO_SMALL_CELL_THRESHOLD,
): FunnelHierarchy {
  const facilities = funnelCountsByGroup(ds, "facility");
  const weeks = groupKeys(ds, "week");
  const sets = funnelScreeningSets(ds);
  const weekIndex = new Map(weeks.map((w, i) => [w, i]));
  const facilityDistrict = new Map(ds.cohort.facilities.map((f) => [f.id as string, f.districtId]));

  const values = new Map<string, number>();
  const lines: SuppressionLine[] = [];
  const fKey = (f: string, c: FunnelColumn) => `f|${f}|${c}`;
  const dKey = (d: string, c: FunnelColumn) => `d|${d}|${c}`;
  const rKey = (c: FunnelColumn) => `r|${c}`;
  const wKey = (f: string, w: number, c: FunnelColumn) => `w|${f}|${w}|${c}`;

  // Weekly counts per facility × column.
  const weekly = new Map<string, number[]>();
  for (const f of facilities) {
    for (const c of FUNNEL_COLUMNS)
      weekly.set(
        fKey(f.key, c),
        weeks.map(() => 0),
      );
  }
  for (const s of ds.cohort.screenings) {
    const w = weekIndex.get(kigaliIsoWeekStart(s.measuredAt));
    if (w === undefined) continue;
    for (const c of FUNNEL_COLUMNS) {
      if (!sets[c].has(s.id)) continue;
      const list = weekly.get(fKey(s.facilityId, c));
      if (list) list[w] = (list[w] ?? 0) + 1;
    }
  }

  const districtIds = ds.cohort.districts.map((d) => d.id as string);
  for (const c of FUNNEL_COLUMNS) {
    let rootTotal = 0;
    for (const d of districtIds) {
      const members = facilities.filter((f) => facilityDistrict.get(f.key) === d);
      let districtTotal = 0;
      for (const f of members) {
        values.set(fKey(f.key, c), f.counts[c]);
        districtTotal += f.counts[c];
        const series = weekly.get(fKey(f.key, c)) ?? [];
        series.forEach((n, w) => values.set(wKey(f.key, w, c), n));
        // Weeks outside the period never hold cohort screenings, so the series sums to the count.
        lines.push({ members: series.map((_, w) => wKey(f.key, w, c)), total: fKey(f.key, c) });
      }
      values.set(dKey(d, c), districtTotal);
      lines.push({ members: members.map((f) => fKey(f.key, c)), total: dKey(d, c) });
      rootTotal += districtTotal;
    }
    values.set(rKey(c), rootTotal);
    lines.push({ members: districtIds.map((d) => dKey(d, c)), total: rKey(c) });
  }

  const out = suppressLines(values, lines, threshold);
  const cellOf = (key: string, column: FunnelColumn): AggregateCell => {
    const n = out.get(key) as SuppressedNumber;
    return n.reason === undefined
      ? { key: column, value: n.value, suppressed: n.suppressed }
      : { key: column, value: n.value, suppressed: n.suppressed, reason: n.reason };
  };
  const node = (key: string, keyOf: (c: FunnelColumn) => string): FunnelNode => {
    const cells = Object.fromEntries(FUNNEL_COLUMNS.map((c) => [c, cellOf(keyOf(c), c)])) as Record<
      FunnelColumn,
      AggregateCell
    >;
    return { key, cells, ...funnelRateCells(cells) };
  };

  return {
    threshold,
    root: node("all", rKey),
    districts: districtIds.map((d) => ({
      ...node(d, (c) => dKey(d, c)),
      facilities: facilities
        .filter((f) => facilityDistrict.get(f.key) === d)
        .map((f) => ({
          ...node(f.key, (c) => fKey(f.key, c)),
          districtId: d,
          weekly: weeks.map(
            (_, w) =>
              Object.fromEntries(
                FUNNEL_COLUMNS.map((c) => [c, cellOf(wKey(f.key, w, c), c)]),
              ) as Record<FunnelColumn, AggregateCell>,
          ),
        })),
    })),
    weeks,
    suppressedCount: [...out.values()].filter((n) => n.suppressed).length,
  };
}
