import { describe, expect, it } from "vitest";

import { SCREENING_STATUSES } from "../enums.ts";
import { screeningMachine } from "./screening.ts";
import { expectExactTransitions } from "../testing/machine-helpers.ts";

describe("screeningMachine", () => {
  it("allows exactly the spec §5.2 transitions", () => {
    expectExactTransitions(screeningMachine, SCREENING_STATUSES, [
      ["draft", "submitted"],
      ["submitted", "review_required"],
      ["submitted", "no_review_required"],
    ]);
  });

  it("has terminal review outcomes", () => {
    expect([...screeningMachine.terminal].sort()).toEqual([
      "no_review_required",
      "review_required",
    ]);
  });
});
