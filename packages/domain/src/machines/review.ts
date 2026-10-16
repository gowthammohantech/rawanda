import type { ReviewStatus } from "../enums.ts";
import { defineMachine } from "./define-machine.ts";

/**
 * Spec §5.2: pending → in_review → action_recorded | dismissed_with_reason.
 * ★ A decision may be recorded directly from `pending` (`startReview` is optional).
 */
export const reviewMachine = defineMachine<ReviewStatus>("review", {
  pending: ["in_review", "action_recorded", "dismissed_with_reason"],
  in_review: ["action_recorded", "dismissed_with_reason"],
  action_recorded: [],
  dismissed_with_reason: [],
});
