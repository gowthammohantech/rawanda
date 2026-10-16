import { describe, expect, it } from "vitest";

import { REVIEW_STATUSES } from "../enums.ts";
import { reviewMachine } from "./review.ts";
import { expectExactTransitions } from "../testing/machine-helpers.ts";

describe("reviewMachine", () => {
  it("allows exactly the spec §5.2 transitions plus ★ direct decision from pending", () => {
    expectExactTransitions(reviewMachine, REVIEW_STATUSES, [
      ["pending", "in_review"],
      ["pending", "action_recorded"],
      ["pending", "dismissed_with_reason"],
      ["in_review", "action_recorded"],
      ["in_review", "dismissed_with_reason"],
    ]);
  });

  it("has decided states as terminal", () => {
    expect([...reviewMachine.terminal].sort()).toEqual([
      "action_recorded",
      "dismissed_with_reason",
    ]);
  });
});
