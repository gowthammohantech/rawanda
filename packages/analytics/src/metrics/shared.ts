/** Shared predicates and numeric helpers for the calculators (pure). */
import type { FollowUp, Referral, Review, Screening } from "@laif/domain";

import type { Rate } from "../types.ts";

/** Submitted (non-draft) screening — the `recorded` stage. */
export const isRecorded = (s: Pick<Screening, "status">): boolean => s.status !== "draft";

/** Flagged for clinician review — the `flagged` stage. */
export const isFlagged = (s: Pick<Screening, "status">): boolean => s.status === "review_required";

/** Decided review: action recorded or dismissed with reason. */
export const isReviewDecided = (r: Pick<Review, "status">): boolean =>
  r.status === "action_recorded" || r.status === "dismissed_with_reason";

export const isReviewPending = (r: Pick<Review, "status">): boolean =>
  r.status === "pending" || r.status === "in_review";

/** Completed with evidence and a completion time. */
export const isReferralCompletedWithEvidence = (
  r: Pick<Referral, "status" | "completedAt" | "completionEvidence">,
): boolean => r.status === "completed" && r.completedAt !== null && r.completionEvidence !== null;

/** Completed with a recorded outcome (any outcome). */
export const isFollowUpCompleted = (
  f: Pick<FollowUp, "status" | "completedAt" | "outcome">,
): boolean => f.status === "completed" && f.completedAt !== null && f.outcome !== null;

/** Completed with an outcome AND an evidence type (pathway completion). */
export const isFollowUpCompletedWithEvidence = (
  f: Pick<FollowUp, "status" | "completedAt" | "outcome">,
): boolean => isFollowUpCompleted(f) && f.outcome?.evidenceType != null;

export function round(value: number, digits: number): number {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

/** `numerator / denominator` rounded to 4 decimals; null when the denominator is 0. */
export function rate(numerator: number, denominator: number): Rate {
  return denominator === 0 ? null : round(numerator / denominator, 4);
}

/** Median (mean of the two middle values for even n); null for an empty list. */
export function median(values: readonly number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1
    ? (sorted[mid] as number)
    : ((sorted[mid - 1] as number) + (sorted[mid] as number)) / 2;
}

export function groupBy<T, K>(items: readonly T[], key: (item: T) => K): Map<K, T[]> {
  const out = new Map<K, T[]>();
  for (const item of items) {
    const k = key(item);
    const list = out.get(k);
    if (list) list.push(item);
    else out.set(k, [item]);
  }
  return out;
}
