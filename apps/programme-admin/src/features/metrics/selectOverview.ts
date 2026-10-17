/**
 * Overview selector (ADM-02 tasks 6, 7, 9, 10): `MetricsDataset` → `OverviewMetrics`, made only of
 * `AggregateCell`s keyed by facility / district / week / metric ids — no patient or record ids.
 *
 * Suppression: ONE FND-06 `suppressCells` call over facilities × count metrics with column
 * totals, so the KPI strip values ARE the protected column totals (complementary suppression
 * applies whenever a total is shown). Rates and the median follow their basis cells.
 */
import {
  countByFacility,
  countByScreeningType,
  countDistinctPeopleScreened,
  derivedCell,
  fromColumn,
  medianDaysToReview,
  needsAttention,
  OVERVIEW_COUNT_METRICS,
  PENDING_REVIEW_AGE_BUCKETS,
  rateCell,
  suppressCells,
  toCell,
  toCells,
  weeklyScreenedVsFlagged,
  type AggregateCell,
  type CellList,
  type MetricsDataset,
  type OverviewCountMetric,
  type PendingReviewAgeBucket,
} from "@laif/analytics";

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

export function selectOverview(ds: MetricsDataset, threshold: number): OverviewMetrics {
  const byMetric = OVERVIEW_COUNT_METRICS.map((m) => countByFacility(ds, m));
  const facilities = ds.cohort.facilities;
  const table = suppressCells(
    {
      rowDimension: "facility_id",
      columnDimension: "metric_id",
      rowKeys: facilities.map((f) => f.id),
      columnKeys: [...OVERVIEW_COUNT_METRICS],
      cells: facilities.map((_, r) => byMetric.map((col) => col[r]?.value ?? 0)),
      columnTotals: true,
      grandTotal: false,
    },
    threshold,
  );
  const columns = OVERVIEW_COUNT_METRICS.map((m, c) => [m, fromColumn(table, c, m)] as const);
  const column = (m: OverviewCountMetric): CellList =>
    (columns.find(([id]) => id === m) as readonly [OverviewCountMetric, CellList])[1];
  const totals = Object.fromEntries(
    OVERVIEW_COUNT_METRICS.map((m) => [m, column(m).total as AggregateCell]),
  ) as Record<OverviewCountMetric, AggregateCell>;

  const facilityRows: FacilityRow[] = facilities.map((f, r) => {
    const cells = Object.fromEntries(
      OVERVIEW_COUNT_METRICS.map((m) => [m, column(m).cells[r] as AggregateCell]),
    ) as Record<OverviewCountMetric, AggregateCell>;
    return {
      facilityId: f.id,
      districtId: f.districtId,
      cells,
      completionRate: rateCell("completionRate", cells.followUpCompleted, cells.referred),
    };
  });

  // Weekly series: primary + complementary within each series (column totals not displayed).
  const weeks = weeklyScreenedVsFlagged(ds);
  const weekTable = suppressCells(
    {
      rowDimension: "week_start",
      columnDimension: "metric_id",
      rowKeys: weeks.map((w) => w.weekStart),
      columnKeys: ["screened", "flagged"],
      cells: weeks.map((w) => [w.screened, w.flagged]),
      columnTotals: true,
      grandTotal: false,
    },
    threshold,
  );
  const weekScreened = fromColumn(weekTable, 0);
  const weekFlagged = fromColumn(weekTable, 1);

  const types = countByScreeningType(ds);
  const attention = needsAttention(ds);
  const reviewed = totals.reviewed;

  const out: OverviewMetrics = {
    threshold,
    computedAt: ds.nowIso,
    rulesetVersions: ds.rulesetVersions,
    excludedConsentWithdrawn: ds.excludedConsentWithdrawn,
    empty: ds.cohort.screenings.length === 0,
    totals,
    peopleScreened: toCell("peopleScreened", countDistinctPeopleScreened(ds), threshold),
    medianDaysToReview: derivedCell("medianDaysToReview", medianDaysToReview(ds), reviewed),
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
    weekly: weeks.map((w, i) => ({
      weekStart: w.weekStart,
      screened: weekScreened.cells[i] as AggregateCell,
      flagged: weekFlagged.cells[i] as AggregateCell,
    })),
    screeningType: toCells(
      [
        { key: "bpOnly", value: types.bpOnly },
        { key: "glucoseOnly", value: types.glucoseOnly },
        { key: "both", value: types.both },
        { key: "neither", value: types.neither },
      ],
      threshold,
      { withTotal: true },
    ),
    needsAttention: {
      overdueReferrals: toCell("overdueReferrals", attention.overdueReferrals, threshold),
      overdueFollowUps: toCell("overdueFollowUps", attention.overdueFollowUps, threshold),
      openQualityIssues: toCell("openQualityIssues", attention.openQualityIssues, threshold),
      pendingReviewAges: Object.fromEntries(
        PENDING_REVIEW_AGE_BUCKETS.map((b) => [
          b,
          toCell(b, attention.pendingReviewAges[b], threshold),
        ]),
      ) as Record<PendingReviewAgeBucket, AggregateCell>,
    },
    suppressedCount: table.suppressedCount,
  };
  return out;
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
