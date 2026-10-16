import { describe, expect, it } from "vitest";

import { CARE_TASK_STATUSES } from "../enums.ts";
import { careTaskMachine } from "./care-task.ts";
import { expectExactTransitions } from "../testing/machine-helpers.ts";

describe("careTaskMachine", () => {
  it("allows exactly open → in_progress → done and cancellation from open / in_progress", () => {
    expectExactTransitions(careTaskMachine, CARE_TASK_STATUSES, [
      ["open", "in_progress"],
      ["in_progress", "done"],
      ["open", "cancelled_with_reason"],
      ["in_progress", "cancelled_with_reason"],
    ]);
  });

  it("has done and cancelled as terminal", () => {
    expect([...careTaskMachine.terminal].sort()).toEqual(["cancelled_with_reason", "done"]);
  });
});
