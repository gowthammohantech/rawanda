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
  filterDataset,
  medianDaysToReview,
  needsAttention,
  OVERVIEW_COUNT_METRICS,
  PENDING_REVIEW_AGE_BUCKETS,
  rateCell,
  suppressLines,
  suppressValue,
  weeklyScreenedVsFlagged,
  type AggregateCell,
  type CellList,
  type MetricsDataset,
  type OverviewCountMetric,
  type PendingReviewAgeBucket,
  type SuppressionLine,
} from "@laif/analytics";
import type { DistrictId, FacilityId } from "@laif/domain";

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

const ATTENTION_KEYS = [
  "overdueReferrals",
  "overdueFollowUps",
  "openQualityIssues",
  ...PENDING_REVIEW_AGE_BUCKETS.map((b) => `age:${b}` as const),
] as const;

const TYPE_KEYS = ["bpOnly", "glucoseOnly", "both", "neither"] as const;

/** The dataset restricted to districts / facilities (same period, type and clock). */
export function restrictDataset(
  ds: MetricsDataset,
  scope: { districtIds?: string[]; facilityIds?: string[] },
): MetricsDataset {
  return filterDataset(
    ds.cohort,
    {
      ...(ds.filter.from === null ? {} : { from: ds.filter.from }),
      ...(ds.filter.to === null ? {} : { to: ds.filter.to }),
      ...(scope.districtIds === undefined
        ? {}
        : { districtIds: scope.districtIds as DistrictId[] }),
      ...(scope.facilityIds === undefined
        ? {}
        : { facilityIds: scope.facilityIds as FacilityId[] }),
      type: ds.filter.type,
    },
    new Date(ds.nowIso),
  );
}

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
  const attention = needsAttention(fds);
  out.set("overdueReferrals", attention.overdueReferrals);
  out.set("overdueFollowUps", attention.overdueFollowUps);
  out.set("openQualityIssues", attention.openQualityIssues);
  for (const b of PENDING_REVIEW_AGE_BUCKETS) out.set(`age:${b}`, attention.pendingReviewAges[b]);
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
    ...ATTENTION_KEYS,
  ];
  const districtIds = ds.cohort.districts.map((d) => d.id as string);
  const facilitiesOf = (d: string) => ds.cohort.facilities.filter((f) => f.districtId === d);

  const values = new Map<string, number>();
  const lines: SuppressionLine[] = [];
  const key = (node: string, measure: string) => `${node}#${measure}`;
  /** Series / parts of a node sum to its counts (protected together). */
  const nodeLines = (node: string) => {
    lines.push({
      members: weeks.map((_, i) => key(node, `wS:${i}`)),
      total: key(node, "screened"),
    });
    lines.push({ members: weeks.map((_, i) => key(node, `wF:${i}`)), total: key(node, "flagged") });
    lines.push({
      members: TYPE_KEYS.map((t) => key(node, `t:${t}`)),
      total: key(node, "screened"),
    });
  };

  const root = "r|all";
  const rootTotals = new Map(measures.map((m) => [m, 0]));
  for (const d of districtIds) {
    const dNode = `d|${d}`;
    const members = facilitiesOf(d);
    const dTotals = new Map(measures.map((m) => [m, 0]));
    for (const f of members) {
      const fNode = `f|${f.id}`;
      const raw = facilityMeasures(restrictDataset(ds, { facilityIds: [f.id] }), weeks);
      for (const m of measures) {
        const n = raw.get(m) ?? 0;
        values.set(key(fNode, m), n);
        dTotals.set(m, (dTotals.get(m) ?? 0) + n);
      }
      nodeLines(fNode);
    }
    for (const m of measures) {
      const n = dTotals.get(m) ?? 0;
      values.set(key(dNode, m), n);
      rootTotals.set(m, (rootTotals.get(m) ?? 0) + n);
      lines.push({ members: members.map((f) => key(`f|${f.id}`, m)), total: key(dNode, m) });
    }
    nodeLines(dNode);
  }
  for (const m of measures) {
    values.set(key(root, m), rootTotals.get(m) ?? 0);
    lines.push({ members: districtIds.map((d) => key(`d|${d}`, m)), total: key(root, m) });
  }
  nodeLines(root);

  const out = suppressLines(values, lines, threshold);
  const cellOf = (node: string, measure: string, cellKey: string = measure): AggregateCell => {
    const n = out.get(key(node, measure));
    if (n === undefined) return { key: cellKey, value: 0, suppressed: false };
    return n.reason === undefined
      ? { key: cellKey, value: n.value, suppressed: n.suppressed }
      : { key: cellKey, value: n.value, suppressed: n.suppressed, reason: n.reason };
  };

  const facilityDistrict = new Map(ds.cohort.facilities.map((f) => [f.id as string, f.districtId]));
  const viewNode =
    view.facility !== null
      ? `f|${view.facility}`
      : view.district !== null
        ? `d|${view.district}`
        : root;
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
