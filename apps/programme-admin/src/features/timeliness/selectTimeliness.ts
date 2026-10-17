/**
 * Timeliness selector (ADM-04): `MetricsDataset` of the actor's FULL grant scope → the view's
 * `TimelinessView`, made only of `AggregateCell`s keyed by facility / week / metric ids.
 *
 * Privacy (same pattern as `selectOverview` / the funnel): ONE scope-wide `suppressOverScope`
 * pass, then the selected district / facility picks its cells.
 * - Additive nodes: the review-delay n (`delayN`) with its weekly n's (`wN:i`, lines weekly →
 *   n), the referral-completion n (`cmpN`), the overdue trend per week (`odR:i` / `odF:i`), and
 *   the needs-attention measures shared with the overview (`ATTENTION_MEASURES`, identical lines,
 *   so both pages hide exactly the same overdue / pending cells). The LAST trend point IS the
 *   overdue snapshot node, so the trend's last week always equals the KPI and the overview card.
 * - Medians / p90 are not additive: each follows its basis n cell — hidden when n is (n < k by
 *   the primary rule, or complementary), `null` ("—") when n = 0.
 * Pending reviews are only ever bucketed by age: no review target is approved (FRD §5).
 */
import {
  kigaliWeekEnd,
  OVERDUE_TREND_WEEKS,
  overdueTrendWeeks,
  percentile,
  PENDING_AGE_BUCKETS,
  referralCompletionDelaysDays,
  reviewDelayRecords,
  reviewDelaysDays,
  reviewTrendWeeks,
  round,
  weeklyMedianDaysToReview,
  weeklyOverdueTrend,
  type AggregateCell,
  type MetricsDataset,
  type PendingAgeBucket,
} from "@laif/analytics";

import { restrictDataset } from "../metrics/restrictDataset.ts";
import {
  ATTENTION_MEASURES,
  attentionLines,
  attentionMeasures,
  facilityNode,
  ROOT_NODE,
  suppressOverScope,
  viewNodeOf,
  type ScopeView,
} from "../metrics/scopeSuppression.ts";

export type MedianWeek = { weekStart: string; median: AggregateCell; n: AggregateCell };

export type OverdueWeek = {
  weekStart: string;
  /** Instant counted (week end, or now for the last point). */
  at: string;
  /** True for the last point (as of now). */
  current: boolean;
  referrals: AggregateCell;
  followUps: AggregateCell;
};

export type FacilityMedianRow = {
  facilityId: string;
  districtId: string;
  median: AggregateCell;
  n: AggregateCell;
};

export type TimelinessView = {
  threshold: number;
  /** Demo-clock instant the figures are computed for (ISO UTC). */
  computedAt: string;
  rulesetVersions: string[];
  excludedConsentWithdrawn: number;
  /** No completed review in the view's period. */
  noReviews: boolean;
  kpis: {
    median: AggregateCell;
    p90: AggregateCell;
    /** Reviews behind the median / p90. */
    reviews: AggregateCell;
    pending: AggregateCell;
    pendingAged8Plus: AggregateCell;
    overdueReferrals: AggregateCell;
    overdueFollowUps: AggregateCell;
    referralCompletionMedian: AggregateCell;
    referralCompletions: AggregateCell;
  };
  medianTrend: MedianWeek[];
  overdueTrend: OverdueWeek[];
  aging: Record<PendingAgeBucket, AggregateCell>;
  facilities: FacilityMedianRow[];
};

const TREND_WEEKS = OVERDUE_TREND_WEEKS;

const days1dp = (v: number | null): number | null => (v === null ? null : round(v, 1));

/** A median / percentile shown only with its basis n: hidden with it, "—" when n = 0. */
function statCell(key: string, value: number | null, basis: AggregateCell): AggregateCell {
  if (basis.suppressed) {
    return { key, value: null, suppressed: true, reason: basis.reason ?? "COMPLEMENTARY" };
  }
  return { key, value: basis.value === 0 ? null : value, suppressed: false };
}

export function selectTimeliness(
  ds: MetricsDataset,
  view: ScopeView,
  threshold: number,
): TimelinessView {
  const reviewWeeks = reviewTrendWeeks(ds);
  const now = new Date(ds.nowIso);
  const trendWeeks = overdueTrendWeeks(now, TREND_WEEKS);
  const last = trendWeeks.length - 1;
  /** Trend node of week i: the last point is the overdue snapshot itself. */
  const odR = (i: number) => (i === last ? "overdueReferrals" : `odR:${i}`);
  const odF = (i: number) => (i === last ? "overdueFollowUps" : `odF:${i}`);

  const measures = [
    ...ATTENTION_MEASURES,
    "delayN",
    ...reviewWeeks.map((_, i) => `wN:${i}`),
    "cmpN",
    ...trendWeeks.slice(0, last).flatMap((_, i) => [odR(i), odF(i)]),
  ];

  const pass = suppressOverScope(
    ds,
    {
      measures,
      facilityMeasures: (fds) => {
        const out = attentionMeasures(fds);
        out.set("delayN", reviewDelaysDays(fds).length);
        weeklyMedianDaysToReview(fds, reviewWeeks).forEach((w, i) => out.set(`wN:${i}`, w.n));
        out.set("cmpN", referralCompletionDelaysDays(fds).length);
        weeklyOverdueTrend(fds, TREND_WEEKS).forEach((p, i) => {
          if (i === last) return; // = overdueSnapshot (set by attentionMeasures)
          out.set(odR(i), p.referrals);
          out.set(odF(i), p.followUps);
        });
        return out;
      },
      nodeLines: (node, key) => [
        ...attentionLines(node, key),
        { members: reviewWeeks.map((_, i) => key(node, `wN:${i}`)), total: key(node, "delayN") },
      ],
    },
    threshold,
  );
  const { cellOf } = pass;

  const viewNode = viewNodeOf(view);
  const viewDs =
    viewNode === ROOT_NODE
      ? ds
      : restrictDataset(ds, {
          ...(view.district === null ? {} : { districtIds: [view.district] }),
          ...(view.facility === null ? {} : { facilityIds: [view.facility] }),
        });

  const delays = reviewDelaysDays(viewDs);
  const reviews = cellOf(viewNode, "delayN", "reviews");
  const completions = cellOf(viewNode, "cmpN", "referralCompletions");
  const weeklyMedians = weeklyMedianDaysToReview(viewDs, reviewWeeks);

  const byFacility = new Map<string, number[]>();
  for (const r of reviewDelayRecords(ds)) {
    const list = byFacility.get(r.facilityId);
    if (list) list.push(r.days);
    else byFacility.set(r.facilityId, [r.days]);
  }
  const viewFacilities = ds.cohort.facilities.filter(
    (f) =>
      (view.facility === null || f.id === view.facility) &&
      (view.district === null || f.districtId === view.district),
  );

  return {
    threshold,
    computedAt: ds.nowIso,
    rulesetVersions: viewDs.rulesetVersions,
    excludedConsentWithdrawn: viewDs.excludedConsentWithdrawn,
    noReviews: delays.length === 0,
    kpis: {
      median: statCell("median", days1dp(percentile(delays, 50)), reviews),
      p90: statCell("p90", days1dp(percentile(delays, 90)), reviews),
      reviews,
      pending: cellOf(viewNode, "pending"),
      pendingAged8Plus: cellOf(viewNode, "age:8+"),
      overdueReferrals: cellOf(viewNode, "overdueReferrals"),
      overdueFollowUps: cellOf(viewNode, "overdueFollowUps"),
      referralCompletionMedian: statCell(
        "referralCompletionMedian",
        days1dp(percentile(referralCompletionDelaysDays(viewDs), 50)),
        completions,
      ),
      referralCompletions: completions,
    },
    medianTrend: reviewWeeks.map((weekStart, i) => {
      const n = cellOf(viewNode, `wN:${i}`, weekStart);
      return { weekStart, n, median: statCell(weekStart, weeklyMedians[i]?.median ?? null, n) };
    }),
    overdueTrend: trendWeeks.map((weekStart, i) => ({
      weekStart,
      at: i === last ? ds.nowIso : kigaliWeekEnd(weekStart).toISOString(),
      current: i === last,
      referrals: cellOf(viewNode, odR(i), weekStart),
      followUps: cellOf(viewNode, odF(i), weekStart),
    })),
    aging: Object.fromEntries(
      PENDING_AGE_BUCKETS.map((b) => [b, cellOf(viewNode, `age:${b}`, b)]),
    ) as Record<PendingAgeBucket, AggregateCell>,
    facilities: viewFacilities.map((f) => {
      const n = cellOf(facilityNode(f.id), "delayN", f.id);
      return {
        facilityId: f.id,
        districtId: f.districtId,
        n,
        median: statCell(f.id, days1dp(percentile(byFacility.get(f.id) ?? [], 50)), n),
      };
    }),
  };
}
