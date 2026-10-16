import { describe, expect, it } from "vitest";

import { FOLLOW_UP_STATUSES, type ClinicianConfirmationState } from "../enums.ts";
import { DomainInvariantError, IllegalTransitionError } from "../errors.ts";
import { assertFollowUpTransition, followUpMachine } from "./follow-up.ts";
import { expectExactTransitions } from "../testing/machine-helpers.ts";

describe("followUpMachine", () => {
  it("allows exactly the spec §5.2 + ★ transitions", () => {
    expectExactTransitions(followUpMachine, FOLLOW_UP_STATUSES, [
      ["assigned", "contacted"],
      ["assigned", "unable_to_reach"],
      ["assigned", "completed"],
      ["reassigned", "contacted"],
      ["reassigned", "unable_to_reach"],
      ["reassigned", "completed"],
      ["contacted", "completed"],
      ["contacted", "unable_to_reach"],
      ["unable_to_reach", "reassigned"],
      ["unable_to_reach", "completed"],
      ["completed", "contacted"],
    ]);
  });

  it("has no terminal state because of the guarded return-to-worker edge", () => {
    expect(followUpMachine.terminal).toEqual([]);
  });
});

describe("assertFollowUpTransition", () => {
  const fu = (
    status: (typeof FOLLOW_UP_STATUSES)[number],
    confirmation: ClinicianConfirmationState,
  ) => ({
    status,
    clinicianConfirmation: { status: confirmation },
  });

  it("allows completed → contacted only via return_to_worker while confirmation is pending", () => {
    expect(() =>
      assertFollowUpTransition(fu("completed", "pending"), "contacted", "return_to_worker"),
    ).not.toThrow();
  });

  it.each(["not_required", "confirmed", "returned"] as const)(
    "rejects return_to_worker when confirmation is %s",
    (confirmation) => {
      expect(() =>
        assertFollowUpTransition(fu("completed", confirmation), "contacted", "return_to_worker"),
      ).toThrow(DomainInvariantError);
    },
  );

  it("rejects completed → contacted through any other action", () => {
    try {
      assertFollowUpTransition(fu("completed", "pending"), "contacted", "record_attempt");
      expect.unreachable();
    } catch (error) {
      expect(error).toMatchObject({ code: "RETURN_TO_WORKER_NOT_ALLOWED" });
    }
  });

  it("delegates other pairs to the table", () => {
    expect(() =>
      assertFollowUpTransition(fu("assigned", "not_required"), "contacted", "record_attempt"),
    ).not.toThrow();
    expect(() =>
      assertFollowUpTransition(fu("contacted", "not_required"), "reassigned", "reassign"),
    ).toThrow(IllegalTransitionError);
  });
});
