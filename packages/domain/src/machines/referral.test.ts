import { describe, expect, it } from "vitest";

import { REFERRAL_STATUSES } from "../enums.ts";
import { referralMachine } from "./referral.ts";
import { expectExactTransitions } from "../testing/machine-helpers.ts";

describe("referralMachine", () => {
  it("allows the linear path and ★ cancel from any non-terminal state", () => {
    expectExactTransitions(referralMachine, REFERRAL_STATUSES, [
      ["created", "accepted"],
      ["accepted", "scheduled"],
      ["scheduled", "completed"],
      ["created", "cancelled_with_reason"],
      ["accepted", "cancelled_with_reason"],
      ["scheduled", "cancelled_with_reason"],
    ]);
  });

  it("has completed and cancelled as terminal", () => {
    expect([...referralMachine.terminal].sort()).toEqual(["cancelled_with_reason", "completed"]);
  });
});
