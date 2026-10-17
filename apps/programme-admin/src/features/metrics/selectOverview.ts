/**
 * Overview selector (ADM-02 tasks 6, 7, 9, 10): `MetricsDataset` → `OverviewMetrics`, made only of
 * `AggregateCell`s keyed by facility / district / week / metric ids — no patient or record ids.
 *
 * Suppression (view-consistent, ADM-03 — same pattern as the funnel's `funnelHierarchy`): ONE
 * `suppressLines` pass over the actor's FULL grant scope. Every additive published count (the
 * count metrics, the weekly screened / flagged series, the screening-type split and the
 * needs-attention counts) is a node at facility, district and programme level, linked by the
 * additive lines facility → district → programme and series / parts → count. The selected view
 * (programme, one district or one facility) only PICKS its cells from that single result, so
 * "All districts" and "District Alpha" never hide different cells and subtracting one view from
 * another (or from the funnel, for the same lines) recovers nothing hidden. Non-additive values:
 * distinct people screened is hidden in a narrower view when it differs from an enclosing scope
 * by a small (primary-suppressed) amount; the median follows its basis cell. Rates follow their
 * numerator and denominator cells. The KPI strip values are the view node's protected totals.
 */
import {
  countByFacility,
  countByScreeningType,
  countDistinctPeopleScreened,
  derivedCell,
  medianDaysToReview,
  OVERVIEW_COUNT_METRICS,
  PENDING_REVIEW_AGE_BUCKETS,
  rateCell,
  suppressValue,
  weeklyScreenedVsFlagged,
  type AggregateCell,
  type CellList,
  type MetricsDataset,
  type OverviewCountMetric,
  type PendingReviewAgeBucket,
} from "@laif/analytics";

import { restrictDataset } from "./restrictDataset.ts";
import {
  ATTENTION_MEASURES,
  attentionLines,
  attentionMeasures,
  ROOT_NODE,
  suppressOverScope,
  viewNodeOf,
} from "./scopeSuppression.ts";

export type FacilityRow = {
  facilityId: string;
  districtId: string;
  cells: Record<OverviewCountMetric, AggregateCell>;
  /** followUpCompleted / referred. */
  completionRate: AggregateCell;
};

export type WeekRow = { weekStart: string; screened: AggregateCell; flagged: AggregateCell };

export type OverviewNote = {
  facilityId: string;
  completed: number;
  referred: number;
  /** Whole percent. */
  pct: number;
};

export type OverviewMetrics = {
  threshold: number;
  /** Demo-clock instant of the computation (ISO UTC). */
  computedAt: string;
  rulesetVersions: string[];
  excludedConsentWithdrawn: number;
  /** No submitted screening in the period. */
  empty: boolean;
  totals: Record<OverviewCountMetric, AggregateCell>;
  peopleScreened: AggregateCell;
  medianDaysToReview: AggregateCell;
  rates: {
    flaggedOfScreened: AggregateCell;
    reviewedOfFlagged: AggregateCell;
    completedOfReferred: AggregateCell;
  };
  facilities: FacilityRow[];
  weekly: WeekRow[];
  screeningType: CellList;
  needsAttention: {
    overdueReferrals: AggregateCell;
    overdueFollowUps: AggregateCell;
    openQualityIssues: AggregateCell;
    pendingReviewAges: Record<PendingReviewAgeBucket, AggregateCell>;
  };
  suppressedCount: number;
};

/** The selected presentation scope (the suppression always runs over the whole dataset). */
export type OverviewView = { district: string | null; facility: string | null };

export const ALL_VIEW: OverviewView = { district: null, facility: null };

export type SelectOverviewOptions = {
  view?: OverviewView;
  /**
   * The dataset loaded for the view itself (non-additive values: consent-withdrawn footnote,
   * ruleset versions, median, distinct people). Defaults to the scope dataset restricted to the
   * view (whose consent-withdrawn count is then 0 — callers pass the loaded view dataset).
   */
  viewDataset?: MetricsDataset;
};

const TYPE_KEYS = ["bpOnly", "glucoseOnly", "both", "neither"] as const;

export { restrictDataset };

/** Raw additive measures of one facility (keys: metric ids, `wS:i`, `wF:i`, `t:*`, attention). */
function facilityMeasures(fds: MetricsDataset, weeks: readonly string[]): Map<string, number> {
  const out = new Map<string, number>();
  for (const m of OVERVIEW_COUNT_METRICS) {
    out.set(
      m,
      countByFacility(fds, m).reduce((a, r) => a + r.value, 0),
    );
  }
  const weekly = new Map(weeklyScreenedVsFlagged(fds).map((w) => [w.weekStart, w]));
  weeks.forEach((w, i) => {
    out.set(`wS:${i}`, weekly.get(w)?.screened ?? 0);
    out.set(`wF:${i}`, weekly.get(w)?.flagged ?? 0);
  });
  const types = countByScreeningType(fds);
  for (const t of TYPE_KEYS) out.set(`t:${t}`, types[t]);
  for (const [m, n] of attentionMeasures(fds)) out.set(m, n);
  return out;
}

export function selectOverview(
  ds: MetricsDataset,
  threshold: number,
  options: SelectOverviewOptions = {},
): OverviewMetrics {
  const view = options.view ?? ALL_VIEW;
  const weeks = weeklyScreenedVsFlagged(ds).map((w) => w.weekStart);
  const measures = [
    ...OVERVIEW_COUNT_METRICS,
    ...weeks.flatMap((_, i) => [`wS:${i}`, `wF:${i}`]),
    ...TYPE_KEYS.map((t) => `t:${t}`),
    ...ATTENTION_MEASURES,
  ];
  const pass = suppressOverScope(
    ds,
    {
      measures,
      facilityMeasures: (fds) => facilityMeasures(fds, weeks),
      nodeLines: (node, key) => [
        { members: weeks.map((_, i) => key(node, `wS:${i}`)), total: key(node, "screened") },
        { members: weeks.map((_, i) => key(node, `wF:${i}`)), total: key(node, "flagged") },
        { members: TYPE_KEYS.map((t) => key(node, `t:${t}`)), total: key(node, "screened") },
        ...attentionLines(node, key),
      ],
    },
    threshold,
  );
  const cellOf = pass.cellOf;
  const root = ROOT_NODE;

  const facilityDistrict = new Map(ds.cohort.facilities.map((f) => [f.id as string, f.districtId]));
  const viewNode = viewNodeOf(view);
  const viewFacilities = ds.cohort.facilities.filter(
    (f) =>
      (view.facility === null || f.id === view.facility) &&
      (view.district === null || f.districtId === view.district),
  );
  const viewDs =
    options.viewDataset ??
    (viewNode === root
      ? ds
      : restrictDataset(ds, {
          ...(view.district === null ? {} : { districtIds: [view.district] }),
          ...(view.facility === null ? {} : { facilityIds: [view.facility] }),
        }));

  const totals = Object.fromEntries(
    OVERVIEW_COUNT_METRICS.map((m) => [m, cellOf(viewNode, m)]),
  ) as Record<OverviewCountMetric, AggregateCell>;

  const facilityRows: FacilityRow[] = viewFacilities.map((f) => {
    const cells = Object.fromEntries(
      OVERVIEW_COUNT_METRICS.map((m) => [m, cellOf(`f|${f.id}`, m, f.id)]),
    ) as Record<OverviewCountMetric, AggregateCell>;
    return {
      facilityId: f.id,
      districtId: f.districtId,
      cells,
      completionRate: rateCell("completionRate", cells.followUpCompleted, cells.referred),
    };
  });

  // Distinct people (not additive across facilities): primary rule in the view, and hidden when
  // an enclosing scope differs from it by a primary-suppressed amount (no differencing).
  const people = countDistinctPeopleScreened(viewDs);
  const enclosing: MetricsDataset[] = [];
  if (viewNode !== root) enclosing.push(ds);
  if (view.facility !== null && view.district === null) {
    const d = facilityDistrict.get(view.facility);
    if (d !== undefined) enclosing.push(restrictDataset(ds, { districtIds: [d] }));
  }
  if (view.facility !== null && view.district !== null) {
    enclosing.push(restrictDataset(ds, { districtIds: [view.district] }));
  }
  const peopleHiddenByDifference = enclosing.some((a) => {
    const diff = countDistinctPeopleScreened(a) - people;
    return diff > 0 && suppressValue(diff, threshold).suppressed;
  });
  const peopleScreened: AggregateCell = peopleHiddenByDifference
    ? { key: "peopleScreened", value: null, suppressed: true, reason: "COMPLEMENTARY" }
    : (() => {
        const n = suppressValue(people, threshold);
        return n.reason === undefined
          ? { key: "peopleScreened", value: n.value, suppressed: n.suppressed }
          : { key: "peopleScreened", value: n.value, suppressed: n.suppressed, reason: n.reason };
      })();

  const typeCells = TYPE_KEYS.map((t) => cellOf(viewNode, `t:${t}`, t));
  const screeningType: CellList = {
    cells: typeCells,
    total: cellOf(viewNode, "screened", "total"),
    threshold,
    suppressedCount: typeCells.filter((c) => c.suppressed).length,
  };

  const reviewed = totals.reviewed;
  const shown = [...Object.values(totals), ...facilityRows.flatMap((r) => Object.values(r.cells))];

  return {
    threshold,
    computedAt: ds.nowIso,
    rulesetVersions: viewDs.rulesetVersions,
    excludedConsentWithdrawn: viewDs.excludedConsentWithdrawn,
    empty: viewDs.cohort.screenings.length === 0,
    totals,
    peopleScreened,
    medianDaysToReview: derivedCell("medianDaysToReview", medianDaysToReview(viewDs), reviewed),
    rates: {
      flaggedOfScreened: rateCell("flaggedOfScreened", totals.flagged, totals.screened),
      reviewedOfFlagged: rateCell("reviewedOfFlagged", totals.reviewed, totals.flagged),
      completedOfReferred: rateCell(
        "completedOfReferred",
        totals.followUpCompleted,
        totals.referred,
      ),
    },
    facilities: facilityRows,
    weekly: weeks.map((weekStart, i) => ({
      weekStart,
      screened: cellOf(viewNode, `wS:${i}`, weekStart),
      flagged: cellOf(viewNode, `wF:${i}`, weekStart),
    })),
    screeningType,
    needsAttention: {
      overdueReferrals: cellOf(viewNode, "overdueReferrals"),
      overdueFollowUps: cellOf(viewNode, "overdueFollowUps"),
      openQualityIssues: cellOf(viewNode, "openQualityIssues"),
      pendingReviewAges: Object.fromEntries(
        PENDING_REVIEW_AGE_BUCKETS.map((b) => [b, cellOf(viewNode, `age:${b}`, b)]),
      ) as Record<PendingReviewAgeBucket, AggregateCell>,
    },
    suppressedCount: shown.filter((c) => c.suppressed).length,
  };
}

/**
 * Data note (task 10): the facility with the lowest UNSUPPRESSED completion rate among the
 * facilities shown — "{facility}: {completed} of {referred} referred screenings …". Null when no
 * facility has unsuppressed data (the callout is then omitted). Never a recommendation.
 */
export function deriveOverviewNote(metrics: OverviewMetrics): OverviewNote | null {
  let best: OverviewNote | null = null;
  let bestRate = Number.POSITIVE_INFINITY;
  for (const row of metrics.facilities) {
    const { followUpCompleted, referred } = row.cells;
    const rate = row.completionRate;
    if (rate.suppressed || rate.value === null) continue;
    if (followUpCompleted.value === null || referred.value === null) continue;
    if (rate.value < bestRate) {
      bestRate = rate.value;
      best = {
        facilityId: row.facilityId,
        completed: followUpCompleted.value,
        referred: referred.value,
        pct: Math.round(rate.value * 100),
      };
    }
  }
  return best;
}
