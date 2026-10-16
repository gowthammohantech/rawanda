/**
 * Timeliness (FND-06 task 8). ADM-04 extends this file in place (referral completion medians,
 * age buckets). "Past due" only ever comes from an explicit `dueAt` (FND-02 derive helpers) —
 * there is no approved timing rule.
 */
import { isFollowUpOverdue, isReferralOverdue } from "@laif/domain";

import {
  addDays,
  applyMetricsFilter,
  isoWeekStartOfDay,
  kigaliDate,
  kigaliIsoWeekStart,
} from "../filters.ts";
import type { AnalyticsInput, MetricsFilter } from "../types.ts";
import { isFlagged, isRecorded, isReviewDecided, median, round } from "./shared.ts";

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
