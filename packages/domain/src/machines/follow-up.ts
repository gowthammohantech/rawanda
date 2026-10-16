import type { FollowUp } from "../entities/follow-up.ts";
import type { FollowUpStatus } from "../enums.ts";
import { DomainInvariantError } from "../errors.ts";
import { defineMachine } from "./define-machine.ts";

/**
 * Spec §5.2 FollowUp machine (`overdue` is derived, never a state).
 *
 * - assigned | reassigned → contacted | unable_to_reach | completed (★ reassigned ≡ assigned)
 * - contacted → completed | unable_to_reach
 * - unable_to_reach → reassigned | completed (★ completion records outcome `unable_to_reach`)
 * - ★ completed → contacted ONLY via the clinician action `return_to_worker` while
 *   `clinicianConfirmation.status === 'pending'` (CLN-09). Use `assertFollowUpTransition`
 *   for that guard; the bare table allows the edge.
 */
export const followUpMachine = defineMachine<FollowUpStatus>("follow_up", {
  assigned: ["contacted", "unable_to_reach", "completed"],
  reassigned: ["contacted", "unable_to_reach", "completed"],
  contacted: ["completed", "unable_to_reach"],
  unable_to_reach: ["reassigned", "completed"],
  completed: ["contacted"],
});

/** Same vocabulary as the FND-03 `FollowUpUpdateInputSchema` `action` discriminator. */
export const FOLLOW_UP_ACTIONS = [
  "assign",
  "reassign",
  "set_due_date",
  "record_attempt",
  "record_outcome",
  "add_note",
  "confirm_completion",
  "return_to_worker",
] as const;
export type FollowUpAction = (typeof FOLLOW_UP_ACTIONS)[number];

/**
 * Full follow-up transition guard: the table check plus the ★ `completed → contacted` rule.
 * Throws `IllegalTransitionError` or `DomainInvariantError('RETURN_TO_WORKER_NOT_ALLOWED')`.
 */
export function assertFollowUpTransition(
  followUp: Pick<FollowUp, "status" | "clinicianConfirmation">,
  to: FollowUpStatus,
  action: FollowUpAction,
): void {
  followUpMachine.assert(followUp.status, to);
  if (followUp.status === "completed" && to === "contacted") {
    if (action !== "return_to_worker" || followUp.clinicianConfirmation.status !== "pending") {
      throw new DomainInvariantError("RETURN_TO_WORKER_NOT_ALLOWED", {
        action,
        confirmation: followUp.clinicianConfirmation.status,
      });
    }
  }
}
