/**
 * Screening overview (FND-06). ADM-02 extends this file in place (countByScreeningType,
 * needsAttention, weekly series) — no parallel `overview.ts`.
 */
import type { DistrictId, FacilityId, ScreeningId } from "@laif/domain";

import { hasBp, hasGlucose, isoWeeksBetween, type MetricsDataset } from "../dataset.ts";
import { applyMetricsFilter, kigaliDate, kigaliIsoWeekStart } from "../filters.ts";
import type { AnalyticsInput, MetricsFilter, Rate } from "../types.ts";
import { classifyPathway } from "./funnel.ts";
import { dataQuality } from "./quality.ts";
import { overdueSnapshot, pendingAgeBuckets } from "./timeliness.ts";
import {
  groupBy,
  isFlagged,
  isFollowUpCompleted,
  isRecorded,
  isReferralCompletedWithEvidence,
  isReviewDecided,
  isReviewPending,
  rate,
} from "./shared.ts";

export type OverviewCounts = {
  screeningsRecorded: number;
  distinctPatientsScreened: number;
  screeningsFlagged: number;
  flaggedRate: Rate;
};

export type ScreeningOverview = OverviewCounts & {
  /** Flagged screenings whose review is pending / in review. */
  reviewsPending: number;
  reviewsCompleted: number;
  /** Never counted as completed care (WF-03). */
  reviewsDismissed: number;
  referralsCompleted: number;
  followUpsCompleted: number;
  byFacility: Array<OverviewCounts & { facilityId: FacilityId; districtId: DistrictId }>;
  byDistrict: Array<OverviewCounts & { districtId: DistrictId }>;
};

function counts(screenings: AnalyticsInput["screenings"]): OverviewCounts {
  const recorded = screenings.filter(isRecorded);
  const flagged = recorded.filter(isFlagged).length;
  return {
    screeningsRecorded: recorded.length,
    distinctPatientsScreened: new Set(recorded.map((s) => s.patientId)).size,
    screeningsFlagged: flagged,
    flaggedRate: rate(flagged, recorded.length),
  };
}

export function screeningOverview(
  data: AnalyticsInput,
  filter: MetricsFilter,
  now: Date,
): ScreeningOverview {
  void now;
  const d = applyMetricsFilter(data, filter);
  const pathway = classifyPathway(d);
  const flaggedIds = pathway.flagged;
  const pendingScreenings = new Set(
    d.reviews
      .filter((r) => flaggedIds.has(r.screeningId) && isReviewPending(r))
      .map((r) => r.screeningId),
  );
  // A screening with a decided review is not pending.
  for (const id of pathway.reviewed) pendingScreenings.delete(id);

  return {
    ...counts(d.screenings),
    reviewsPending: pendingScreenings.size,
    reviewsCompleted: pathway.reviewed.size,
    reviewsDismissed: pathway.dismissed.size,
    referralsCompleted: d.referrals.filter(isReferralCompletedWithEvidence).length,
    followUpsCompleted: d.followUps.filter(isFollowUpCompleted).length,
    byFacility: d.facilities.map((f) => ({
      facilityId: f.id,
      districtId: f.districtId,
      ...counts(d.screenings.filter((s) => s.facilityId === f.id)),
    })),
    byDistrict: d.districts.map((dist) => ({
      districtId: dist.id,
      ...counts(d.screenings.filter((s) => s.districtId === dist.id)),
    })),
  };
}

// ── ADM-02 calculators over a `MetricsDataset` (pure; `ds.nowIso` is the only time source) ──

/** Facility-level count metrics of the overview (rows of the suppressed facility table). */
export const OVERVIEW_COUNT_METRICS = [
  "screened",
  "flagged",
  "reviewed",
  "dismissed",
  "actioned",
  "referred",
  "followUpCompleted",
] as const;
export type OverviewCountMetric = (typeof OVERVIEW_COUNT_METRICS)[number];

/** Submitted cohort screenings (drafts are already excluded by `filterDataset`). */
export function countScreened(ds: MetricsDataset): number {
  return ds.cohort.screenings.filter(isRecorded).length;
}

export function countDistinctPeopleScreened(ds: MetricsDataset): number {
  return new Set(ds.cohort.screenings.filter(isRecorded).map((s) => s.patientId)).size;
}

/** Cohort screenings with status `review_required`. */
export function countFlagged(ds: MetricsDataset): number {
  return ds.cohort.screenings.filter((s) => isRecorded(s) && isFlagged(s)).length;
}

type ReviewOutcomeSets = {
  reviewed: Set<ScreeningId>;
  dismissed: Set<ScreeningId>;
  actioned: Set<ScreeningId>;
};

function reviewOutcomes(ds: MetricsDataset): ReviewOutcomeSets {
  const flagged = new Set(
    ds.cohort.screenings.filter((s) => isRecorded(s) && isFlagged(s)).map((s) => s.id),
  );
  const out: ReviewOutcomeSets = { reviewed: new Set(), dismissed: new Set(), actioned: new Set() };
  for (const r of ds.cohort.reviews) {
    if (!flagged.has(r.screeningId) || !isReviewDecided(r)) continue;
    out.reviewed.add(r.screeningId);
    if (r.status === "dismissed_with_reason") out.dismissed.add(r.screeningId);
    else out.actioned.add(r.screeningId);
  }
  return out;
}

/** Flagged cohort screenings with a review `action_recorded` or `dismissed_with_reason`. */
export function countReviewed(ds: MetricsDataset): number {
  return reviewOutcomes(ds).reviewed.size;
}

/** Reviewed flags dismissed with a reason — never counted as completed care (WF-03). */
export function countDismissed(ds: MetricsDataset): number {
  return reviewOutcomes(ds).dismissed.size;
}

/** Reviewed flags with an action recorded. */
export function countActioned(ds: MetricsDataset): number {
  return reviewOutcomes(ds).actioned.size;
}

/** Pathway `referred` stage (FND-06 `classifyPathway`) over the cohort. */
export function countReferred(ds: MetricsDataset): number {
  return classifyPathway(ds.cohort).referred.size;
}

/**
 * Cohort screenings with ≥1 referral completed with `completedAt` + `completionEvidence`, or a
 * follow-up completed with `completedAt` + `outcome` (attributed through its review / referral).
 */
export function followUpCompletedScreeningIds(ds: MetricsDataset): Set<ScreeningId> {
  const reviewToScreening = new Map<string, ScreeningId>(
    ds.cohort.reviews.map((r) => [r.id, r.screeningId]),
  );
  const referralToScreening = new Map<string, ScreeningId>();
  for (const ref of ds.cohort.referrals) {
    const s = reviewToScreening.get(ref.reviewId);
    if (s !== undefined) referralToScreening.set(ref.id, s);
  }
  const out = new Set<ScreeningId>();
  for (const ref of ds.cohort.referrals) {
    const s = referralToScreening.get(ref.id);
    if (s !== undefined && isReferralCompletedWithEvidence(ref)) out.add(s);
  }
  for (const f of ds.cohort.followUps) {
    if (!isFollowUpCompleted(f)) continue;
    const s =
      (f.reviewId === null ? undefined : reviewToScreening.get(f.reviewId)) ??
      (f.referralId === null ? undefined : referralToScreening.get(f.referralId));
    if (s !== undefined) out.add(s);
  }
  return out;
}

export function countFollowUpCompleted(ds: MetricsDataset): number {
  return followUpCompletedScreeningIds(ds).size;
}

export type WeeklyScreenedVsFlagged = { weekStart: string; screened: number; flagged: number };

/** Kigali ISO weeks (Monday start) of the period → screened / flagged. */
export function weeklyScreenedVsFlagged(ds: MetricsDataset): WeeklyScreenedVsFlagged[] {
  const recorded = ds.cohort.screenings.filter(isRecorded);
  const days = recorded.map((s) => kigaliDate(s.measuredAt)).sort();
  const from = ds.filter.from ?? days[0];
  const to = ds.filter.to ?? days[days.length - 1];
  if (from === undefined || to === undefined) return [];
  const byWeek = groupBy(recorded, (s) => kigaliIsoWeekStart(s.measuredAt));
  return isoWeeksBetween(from, to).map((weekStart) => {
    const list = byWeek.get(weekStart) ?? [];
    return { weekStart, screened: list.length, flagged: list.filter(isFlagged).length };
  });
}

function screeningIdsOf(ds: MetricsDataset, metric: OverviewCountMetric): Set<ScreeningId> {
  const recorded = ds.cohort.screenings.filter(isRecorded);
  switch (metric) {
    case "screened":
      return new Set(recorded.map((s) => s.id));
    case "flagged":
      return new Set(recorded.filter(isFlagged).map((s) => s.id));
    case "reviewed":
      return reviewOutcomes(ds).reviewed;
    case "dismissed":
      return reviewOutcomes(ds).dismissed;
    case "actioned":
      return reviewOutcomes(ds).actioned;
    case "referred":
      return classifyPathway(ds.cohort).referred;
    case "followUpCompleted":
      return followUpCompletedScreeningIds(ds);
  }
}

export type FacilityCount = { facilityId: FacilityId; districtId: DistrictId; value: number };

/** One row per in-scope facility (reference order), the metric counted over its screenings. */
export function countByFacility(ds: MetricsDataset, metric: OverviewCountMetric): FacilityCount[] {
  const ids = screeningIdsOf(ds, metric);
  const byFacility = groupBy(
    ds.cohort.screenings.filter((s) => ids.has(s.id)),
    (s) => s.facilityId,
  );
  return ds.cohort.facilities.map((f) => ({
    facilityId: f.id,
    districtId: f.districtId,
    value: byFacility.get(f.id)?.length ?? 0,
  }));
}

export type ScreeningTypeCounts = {
  bpOnly: number;
  glucoseOnly: number;
  both: number;
  /** Neither a systolic nor a glucose value (observations only). */
  neither: number;
};

/** Cohort screenings by measured type (the four parts sum to `countScreened`). */
export function countByScreeningType(ds: MetricsDataset): ScreeningTypeCounts {
  const out: ScreeningTypeCounts = { bpOnly: 0, glucoseOnly: 0, both: 0, neither: 0 };
  for (const s of ds.cohort.screenings.filter(isRecorded)) {
    const bp = hasBp(s);
    const glucose = hasGlucose(s);
    if (bp && glucose) out.both += 1;
    else if (bp) out.bpOnly += 1;
    else if (glucose) out.glucoseOnly += 1;
    else out.neither += 1;
  }
  return out;
}

/** Age buckets of pending reviews (days since measurement) — never labelled overdue. */
export const PENDING_REVIEW_AGE_BUCKETS = ["0-2", "3-7", "8+"] as const;
export type PendingReviewAgeBucket = (typeof PENDING_REVIEW_AGE_BUCKETS)[number];

export type NeedsAttention = {
  /** Incomplete referrals with an explicit `dueAt` before now. */
  overdueReferrals: number;
  /** Incomplete follow-ups with an explicit `dueAt` before now. */
  overdueFollowUps: number;
  /** Pending reviews by age (no approved timing rule — FRD §5). */
  pendingReviewAges: Record<PendingReviewAgeBucket, number>;
  pendingReviewsAged8Plus: number;
  /** Detected data-quality signals: missing glucose unit + possible duplicate identities. */
  openQualityIssues: number;
};

/**
 * Wired to the ADM-04 timeliness calculators (`overdueSnapshot`, `pendingAgeBuckets`), so the
 * overview card and `/admin/timeliness` reconcile: `8+` = `8-14` + `15+`.
 */
export function needsAttention(ds: MetricsDataset): NeedsAttention {
  const now = new Date(ds.nowIso);
  const buckets = pendingAgeBuckets(ds, now);
  const ages: Record<PendingReviewAgeBucket, number> = {
    "0-2": buckets["0-2"],
    "3-7": buckets["3-7"],
    "8+": buckets["8-14"] + buckets["15+"],
  };
  const overdue = overdueSnapshot(ds, now);
  const quality = dataQuality(ds.cohort, {}, now);
  return {
    overdueReferrals: overdue.referrals,
    overdueFollowUps: overdue.followUps,
    pendingReviewAges: ages,
    pendingReviewsAged8Plus: ages["8+"],
    openQualityIssues: quality.missingGlucoseUnit + quality.possibleDuplicateIdentities,
  };
}
