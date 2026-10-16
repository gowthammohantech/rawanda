/**
 * Screening overview (FND-06). ADM-02 extends this file in place (countByScreeningType,
 * needsAttention, weekly series) — no parallel `overview.ts`.
 */
import type { DistrictId, FacilityId } from "@laif/domain";

import { applyMetricsFilter } from "../filters.ts";
import type { AnalyticsInput, MetricsFilter, Rate } from "../types.ts";
import { classifyPathway } from "./funnel.ts";
import {
  isFlagged,
  isFollowUpCompleted,
  isRecorded,
  isReferralCompletedWithEvidence,
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
