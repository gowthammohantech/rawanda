/**
 * Timeliness (FND-06 task 8; ADM-04 extends it in place below: review-delay percentiles, weekly
 * medians, pending-review age buckets, the overdue snapshot and its weekly reconstruction,
 * referral-completion medians and per-facility medians). "Past due" only ever comes from an explicit `dueAt` (FND-02 derive helpers) —
 * there is no approved timing rule.
 */
import {
  isFollowUpOverdue,
  isReferralOverdue,
  type FollowUp,
  type Referral,
  type Screening,
} from "@laif/domain";

import { derivedCell, toCell, type AggregateCell } from "../aggregate-cells.ts";
import type { MetricsDataset } from "../dataset.ts";
import {
  addDays,
  applyMetricsFilter,
  isoWeekStartOfDay,
  KIGALI_UTC_OFFSET_MS,
  kigaliDate,
  kigaliIsoWeekStart,
} from "../filters.ts";
import { DEMO_SMALL_CELL_THRESHOLD, type SuppressedNumber } from "../suppression.ts";
import type { AnalyticsInput, MetricsFilter } from "../types.ts";
import {
  groupBy,
  isFlagged,
  isRecorded,
  isReferralCompletedWithEvidence,
  isReviewDecided,
  isReviewPending,
  median,
  round,
} from "./shared.ts";

const DAY_MS = 86_400_000;

export type TimelinessWeek = {
  /** Monday `YYYY-MM-DD` of the ISO week (Kigali time). */
  weekStart: string;
  screeningsRecorded: number;
  screeningsFlagged: number;
  reviewsCompleted: number;
  medianDaysToReview: number | null;
};

export type Timeliness = {
  /** Median days measuredAt → reviewedAt over decided reviews of flagged screenings (1 dp). */
  medianDaysToReview: number | null;
  reviewsCompleted: number;
  overdueReferrals: number;
  overdueFollowUps: number;
  weekly: TimelinessWeek[];
};

type ReviewDelay = { weekStart: string; days: number };

export function timeliness(data: AnalyticsInput, filter: MetricsFilter, now: Date): Timeliness {
  const d = applyMetricsFilter(data, filter);
  const screenings = d.screenings.filter(isRecorded);
  const byId = new Map(screenings.map((s) => [s.id, s]));

  const delays: ReviewDelay[] = [];
  const seen = new Set<string>();
  for (const r of d.reviews) {
    const s = byId.get(r.screeningId);
    if (!s || !isFlagged(s) || !isReviewDecided(r) || r.reviewedAt === null) continue;
    if (seen.has(s.id)) continue; // one delay per screening (first decided review)
    seen.add(s.id);
    delays.push({
      weekStart: kigaliIsoWeekStart(s.measuredAt),
      days: (Date.parse(r.reviewedAt) - Date.parse(s.measuredAt)) / DAY_MS,
    });
  }

  const medianDays = (list: readonly ReviewDelay[]): number | null => {
    const m = median(list.map((x) => x.days));
    return m === null ? null : round(m, 1);
  };

  return {
    medianDaysToReview: medianDays(delays),
    reviewsCompleted: delays.length,
    overdueReferrals: d.referrals.filter((r) => isReferralOverdue(r, now)).length,
    overdueFollowUps: d.followUps.filter((f) => isFollowUpOverdue(f, now)).length,
    weekly: weeksFor(
      screenings.map((s) => kigaliDate(s.measuredAt)),
      filter,
    ).map((weekStart) => {
      const inWeek = screenings.filter((s) => kigaliIsoWeekStart(s.measuredAt) === weekStart);
      const weekDelays = delays.filter((x) => x.weekStart === weekStart);
      return {
        weekStart,
        screeningsRecorded: inWeek.length,
        screeningsFlagged: inWeek.filter(isFlagged).length,
        reviewsCompleted: weekDelays.length,
        medianDaysToReview: medianDays(weekDelays),
      };
    }),
  };
}

/** Contiguous ISO weeks covering the filter range (or the data's days when unbounded). */
function weeksFor(days: readonly string[], filter: MetricsFilter): string[] {
  const sorted = [...days].sort();
  const from = filter.from ?? sorted[0];
  const to = filter.to ?? sorted[sorted.length - 1];
  if (from === undefined || to === undefined) return [];
  const out: string[] = [];
  for (let w = isoWeekStartOfDay(from); w <= to; w = addDays(w, 7)) out.push(w);
  return out;
}

// ── ADM-04 calculators over a `MetricsDataset` (pure; time only from `ds.nowIso` / `now`) ──

/**
 * Pending-review age buckets (days since measurement). Deliberately NOT "overdue": no review
 * target is approved (FRD §5), so pending reviews are shown by age only.
 */
export const PENDING_AGE_BUCKETS = ["0-2", "3-7", "8-14", "15+"] as const;
export type PendingAgeBucket = (typeof PENDING_AGE_BUCKETS)[number];

/** Default number of weeks of the overdue trend (the last point is `now`). */
export const OVERDUE_TREND_WEEKS = 12;

export type ReviewDelayRecord = {
  facilityId: string;
  districtId: string;
  /** Kigali ISO week (Monday) of `reviewedAt`. */
  reviewWeek: string;
  days: number;
};

const nowOf = (ds: MetricsDataset, now?: Date): Date => now ?? new Date(ds.nowIso);

function flaggedScreenings(ds: MetricsDataset): Map<string, Screening> {
  return new Map(
    ds.cohort.screenings.filter((s) => isRecorded(s) && isFlagged(s)).map((s) => [s.id, s]),
  );
}

/**
 * One delay per reviewed flagged cohort screening: its FIRST decided review (action recorded
 * **or** dismissed with reason — both are clinical reviews), `(reviewedAt − measuredAt)` in days.
 */
export function reviewDelayRecords(ds: MetricsDataset): ReviewDelayRecord[] {
  const flagged = flaggedScreenings(ds);
  const first = new Map<string, string>();
  for (const r of ds.cohort.reviews) {
    if (!flagged.has(r.screeningId) || !isReviewDecided(r) || r.reviewedAt === null) continue;
    const prev = first.get(r.screeningId);
    if (prev === undefined || Date.parse(r.reviewedAt) < Date.parse(prev)) {
      first.set(r.screeningId, r.reviewedAt);
    }
  }
  return [...first.entries()].map(([id, reviewedAt]) => {
    const s = flagged.get(id) as Screening;
    return {
      facilityId: s.facilityId,
      districtId: s.districtId,
      reviewWeek: kigaliIsoWeekStart(reviewedAt),
      days: (Date.parse(reviewedAt) - Date.parse(s.measuredAt)) / DAY_MS,
    };
  });
}

/** Review delays in days (powers `medianDaysToReview`, `p90DaysToReview` and the weekly trend). */
export function reviewDelaysDays(ds: MetricsDataset): number[] {
  return reviewDelayRecords(ds).map((d) => d.days);
}

/**
 * Percentile with linear interpolation between closest ranks (Hyndman & Fan type 7, the
 * spreadsheet `PERCENTILE.INC`): sort ascending, rank `h = (n − 1) · p / 100`, value
 * `x[⌊h⌋] + (h − ⌊h⌋) · (x[⌊h⌋ + 1] − x[⌊h⌋])`. p = 50 is the median (mean of the two middle
 * values for an even n). Null for an empty list.
 */
export function percentile(values: readonly number[], p: number): number | null {
  if (!(p >= 0 && p <= 100)) throw new RangeError(`percentile p must be in [0, 100], got ${p}`);
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const h = ((sorted.length - 1) * p) / 100;
  const lo = Math.floor(h);
  const hi = Math.min(lo + 1, sorted.length - 1);
  const a = sorted[lo] as number;
  const b = sorted[hi] as number;
  return a + (h - lo) * (b - a);
}

const days1dp = (v: number | null): number | null => (v === null ? null : round(v, 1));

/** Median days to review, 1 decimal (`percentile(…, 50)`); null with no reviews. */
export function medianDaysToReview(ds: MetricsDataset): number | null {
  return days1dp(percentile(reviewDelaysDays(ds), 50));
}

/** 90th-percentile days to review, 1 decimal (type-7 interpolation); null with no reviews. */
export function p90DaysToReview(ds: MetricsDataset): number | null {
  return days1dp(percentile(reviewDelaysDays(ds), 90));
}

/**
 * A percentile of a delay sample as a published number: n = 0 → nothing to show (`null`,
 * not hidden); 0 < n < k → suppressed (a percentile of a tiny group can disclose individual
 * timings); otherwise the value to 1 decimal.
 */
export function percentileValue(
  values: readonly number[],
  p: number,
  k: number = DEMO_SMALL_CELL_THRESHOLD,
): SuppressedNumber {
  if (values.length > 0 && values.length < k) {
    return { value: null, suppressed: true, reason: "PRIMARY" };
  }
  return { value: days1dp(percentile(values, p)), suppressed: false };
}

export type WeeklyMedianDays = { weekStart: string; median: number | null; n: number };

/**
 * Weeks of the review-delay trend: contiguous Kigali ISO weeks from the period start to the later
 * of the period end and the last `reviewedAt` (a review can land after the period ends).
 */
export function reviewTrendWeeks(ds: MetricsDataset): string[] {
  const recordWeeks = reviewDelayRecords(ds)
    .map((d) => d.reviewWeek)
    .sort();
  const days = ds.cohort.screenings.map((s) => kigaliDate(s.measuredAt)).sort();
  const from = ds.filter.from ?? days[0] ?? recordWeeks[0];
  let to = ds.filter.to ?? days[days.length - 1] ?? recordWeeks[recordWeeks.length - 1];
  const lastReview = recordWeeks[recordWeeks.length - 1];
  if (to !== undefined && lastReview !== undefined && addDays(lastReview, 6) > to) {
    to = lastReview;
  }
  if (from === undefined || to === undefined) return [];
  const out: string[] = [];
  for (let w = isoWeekStartOfDay(from); w <= to; w = addDays(w, 7)) out.push(w);
  return out;
}

/** Median days to review per Kigali ISO week of `reviewedAt`, with n (weeks default as above). */
export function weeklyMedianDaysToReview(
  ds: MetricsDataset,
  weeks: readonly string[] = reviewTrendWeeks(ds),
): WeeklyMedianDays[] {
  const byWeek = groupBy(reviewDelayRecords(ds), (d) => d.reviewWeek);
  return weeks.map((weekStart) => {
    const list = (byWeek.get(weekStart) ?? []).map((d) => d.days);
    return { weekStart, median: days1dp(percentile(list, 50)), n: list.length };
  });
}

export type PendingReview = { facilityId: string; districtId: string; ageDays: number };

/**
 * Flagged cohort screenings whose review is `pending` / `in_review` (and none decided), with the
 * whole days since measurement as of `now`. Never labelled overdue (no approved review target).
 */
export function pendingReviews(ds: MetricsDataset, now?: Date): PendingReview[] {
  const at = nowOf(ds, now).getTime();
  const flagged = flaggedScreenings(ds);
  const decided = new Set(
    ds.cohort.reviews.filter((r) => isReviewDecided(r)).map((r) => r.screeningId as string),
  );
  const pending = new Set<string>();
  for (const r of ds.cohort.reviews) {
    if (flagged.has(r.screeningId) && isReviewPending(r) && !decided.has(r.screeningId)) {
      pending.add(r.screeningId);
    }
  }
  return [...pending].map((id) => {
    const s = flagged.get(id) as Screening;
    return {
      facilityId: s.facilityId,
      districtId: s.districtId,
      ageDays: Math.floor((at - Date.parse(s.measuredAt)) / DAY_MS),
    };
  });
}

export function pendingAgeBucketOf(ageDays: number): PendingAgeBucket {
  return ageDays >= 15 ? "15+" : ageDays >= 8 ? "8-14" : ageDays >= 3 ? "3-7" : "0-2";
}

/** Pending reviews by age bucket (days since `measuredAt`). */
export function pendingAgeBuckets(
  ds: MetricsDataset,
  now?: Date,
): Record<PendingAgeBucket, number> {
  const out: Record<PendingAgeBucket, number> = { "0-2": 0, "3-7": 0, "8-14": 0, "15+": 0 };
  for (const p of pendingReviews(ds, now)) out[pendingAgeBucketOf(p.ageDays)] += 1;
  return out;
}

export type OverdueSnapshot = { referrals: number; followUps: number };

/**
 * Incomplete referrals / follow-ups whose clinician-set `dueAt` has passed as of `now` (FND-02
 * `isReferralOverdue` / `isFollowUpOverdue`; derived, never stored).
 */
export function overdueSnapshot(ds: MetricsDataset, now?: Date): OverdueSnapshot {
  const at = nowOf(ds, now);
  return {
    referrals: ds.cohort.referrals.filter((r) => isReferralOverdue(r, at)).length,
    followUps: ds.cohort.followUps.filter((f) => isFollowUpOverdue(f, at)).length,
  };
}

/**
 * Status of a referral as it was at instant `at`, reconstructed from timestamps: completed from
 * `completedAt`, cancelled from the last update (no separate cancellation time is stored).
 */
function referralStatusAt(r: Referral, at: number): Referral["status"] {
  if (r.status === "completed" && Date.parse(r.completedAt ?? r.updatedAt) <= at) {
    return "completed";
  }
  if (r.status === "cancelled_with_reason" && Date.parse(r.updatedAt) <= at) {
    return "cancelled_with_reason";
  }
  return "created";
}

function followUpStatusAt(f: FollowUp, at: number): FollowUp["status"] {
  return f.status === "completed" && Date.parse(f.completedAt ?? f.updatedAt) <= at
    ? "completed"
    : "assigned";
}

/** Past due at instant `at`: existed (`requestedAt` / `createdAt` ≤ at) and FND-02 overdue then. */
export function isReferralOverdueAt(r: Referral, at: Date): boolean {
  const t = at.getTime();
  return (
    Date.parse(r.requestedAt) <= t &&
    isReferralOverdue({ status: referralStatusAt(r, t), dueAt: r.dueAt }, at)
  );
}

export function isFollowUpOverdueAt(f: FollowUp, at: Date): boolean {
  const t = at.getTime();
  return (
    Date.parse(f.createdAt) <= t &&
    isFollowUpOverdue({ status: followUpStatusAt(f, t), dueAt: f.dueAt }, at)
  );
}

export type OverdueTrendPoint = {
  /** Monday `YYYY-MM-DD` (Kigali) of the week. */
  weekStart: string;
  /** The instant counted: the week's end (Sunday 23:59:59.999 Kigali), or `now` for the last. */
  at: string;
  referrals: number;
  followUps: number;
};

/** End of the Kigali ISO week that starts on Monday `weekStart` (Sunday 23:59:59.999 Kigali). */
export function kigaliWeekEnd(weekStart: string): Date {
  return new Date(Date.parse(`${addDays(weekStart, 7)}T00:00:00.000Z`) - KIGALI_UTC_OFFSET_MS - 1);
}

/** The `weeks` Kigali ISO week starts ending with the week of `now` (oldest first). */
export function overdueTrendWeeks(now: Date, weeks: number = OVERDUE_TREND_WEEKS): string[] {
  const current = kigaliIsoWeekStart(now);
  return Array.from({ length: weeks }, (_, i) => addDays(current, -7 * (weeks - 1 - i)));
}

/**
 * Overdue history reconstructed from timestamps (no snapshot table): for each week-end instant W
 * (the last point = `now`), items that existed by W, had `dueAt < W`, and were neither completed
 * nor cancelled by W. The last point equals `overdueSnapshot`.
 */
export function weeklyOverdueTrend(
  ds: MetricsDataset,
  weeks: number = OVERDUE_TREND_WEEKS,
  now?: Date,
): OverdueTrendPoint[] {
  const at = nowOf(ds, now);
  const starts = overdueTrendWeeks(at, weeks);
  return starts.map((weekStart, i) => {
    const w = i === starts.length - 1 ? at : kigaliWeekEnd(weekStart);
    return {
      weekStart,
      at: w.toISOString(),
      referrals: ds.cohort.referrals.filter((r) => isReferralOverdueAt(r, w)).length,
      followUps: ds.cohort.followUps.filter((f) => isFollowUpOverdueAt(f, w)).length,
    };
  });
}

/**
 * Days from screening to referral completion (LAIF MoH p. 17 KPI 02): completed referrals of the
 * cohort with evidence, `(completionEvidence.recordedAt − screening.measuredAt)`.
 */
export function referralCompletionDelaysDays(ds: MetricsDataset): number[] {
  const screenings = new Map(ds.cohort.screenings.map((s) => [s.id as string, s]));
  const reviewScreening = new Map(ds.cohort.reviews.map((r) => [r.id as string, r.screeningId]));
  const out: number[] = [];
  for (const ref of ds.cohort.referrals) {
    if (!isReferralCompletedWithEvidence(ref) || ref.completionEvidence === null) continue;
    const sid = reviewScreening.get(ref.reviewId);
    const s = sid === undefined ? undefined : screenings.get(sid);
    if (s === undefined) continue;
    out.push((Date.parse(ref.completionEvidence.recordedAt) - Date.parse(s.measuredAt)) / DAY_MS);
  }
  return out;
}

export function medianDaysToReferralCompletion(ds: MetricsDataset): number | null {
  return days1dp(percentile(referralCompletionDelaysDays(ds), 50));
}

export type FacilityMedian = {
  facilityId: string;
  districtId: string;
  /** Reviews behind the median (primary suppression). */
  n: AggregateCell;
  /** Median days to review; hidden with its n (n < k). */
  median: AggregateCell;
};

/** Median days to review per in-scope facility (reference order); suppressed when n < k. */
export function medianDaysByFacility(
  ds: MetricsDataset,
  k: number = DEMO_SMALL_CELL_THRESHOLD,
): FacilityMedian[] {
  const byFacility = groupBy(reviewDelayRecords(ds), (d) => d.facilityId);
  return ds.cohort.facilities.map((f) => {
    const days = (byFacility.get(f.id) ?? []).map((d) => d.days);
    const n = toCell(f.id, days.length, k);
    const m = percentileValue(days, 50, k);
    return {
      facilityId: f.id,
      districtId: f.districtId,
      n,
      median: derivedCell(f.id, m.suppressed ? null : m.value, m.suppressed ? n : undefined),
    };
  });
}
