/**
 * Review-queue tab predicates (CLN-05), shared by FND-07 `listReviews` / `countReviews` and the
 * UI so badge counts always reconcile with rows. `overdue` is derived from a fixture-labelled
 * `reviewDueAt` only (no approved review SLA exists).
 */
import type { Review } from "./entities/review.ts";
import type { PersonaId } from "./ids.ts";

export const REVIEW_QUEUE_TABS = ["pending", "urgent", "overdue", "assigned", "all"] as const;
export type ReviewQueueTab = (typeof REVIEW_QUEUE_TABS)[number];

export type ReviewQueueContext = { now: Date; personaId: PersonaId | null };

type QueueReview = Pick<Review, "status" | "priority" | "reviewDueAt" | "assignedClinicianId">;

/** Not yet decided (`pending` or `in_review`). */
export const isReviewOpen = (review: Pick<Review, "status">): boolean =>
  review.status === "pending" || review.status === "in_review";

export function matchesReviewQueueTab(
  review: QueueReview,
  tab: ReviewQueueTab,
  context: ReviewQueueContext,
): boolean {
  switch (tab) {
    case "all":
      return true;
    case "pending":
      return isReviewOpen(review);
    case "urgent":
      return isReviewOpen(review) && review.priority === "urgent_demo";
    case "overdue":
      return (
        isReviewOpen(review) &&
        review.reviewDueAt !== null &&
        Date.parse(review.reviewDueAt) < context.now.getTime()
      );
    case "assigned":
      return (
        isReviewOpen(review) &&
        context.personaId !== null &&
        review.assignedClinicianId === context.personaId
      );
  }
}
