/**
 * Pathway funnel (FND-06 task 7). The definitions ADM-03 builds on — ADM phases extend this file
 * in place (cohort attribution, `pctOfRecorded`, `largestDrop`, group-by).
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
import type { ScreeningId } from "@laif/domain";

import { applyMetricsFilter } from "../filters.ts";
import type { MetricKey } from "../metric-keys.ts";
import type { AnalyticsInput, MetricsFilter, Rate } from "../types.ts";
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
