import type { ReferralStatus } from "../enums.ts";
import { defineMachine } from "./define-machine.ts";

/**
 * Spec §5.2: created → accepted → scheduled → completed.
 * ★ Cancellation (with reason) is allowed from any non-terminal state.
 */
export const referralMachine = defineMachine<ReferralStatus>("referral", {
  created: ["accepted", "cancelled_with_reason"],
  accepted: ["scheduled", "cancelled_with_reason"],
  scheduled: ["completed", "cancelled_with_reason"],
  completed: [],
  cancelled_with_reason: [],
});
