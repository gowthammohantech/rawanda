import { describe, expect, it } from "vitest";

import { SYNC_OP_STATUSES } from "../enums.ts";
import { syncOperationMachine } from "./sync-operation.ts";
import { expectExactTransitions } from "../testing/machine-helpers.ts";

describe("syncOperationMachine", () => {
  it("allows exactly the single sync design transitions", () => {
    expectExactTransitions(syncOperationMachine, SYNC_OP_STATUSES, [
      ["queued", "sending"],
      ["sending", "acknowledged"],
      ["sending", "retryable_failure"],
      ["sending", "conflict"],
      ["sending", "rejected"],
      ["retryable_failure", "queued"],
      ["conflict", "needs_resolution"],
      ["needs_resolution", "superseded"],
      ["queued", "blocked_revoked"],
      ["retryable_failure", "blocked_revoked"],
      ["blocked_revoked", "queued"],
    ]);
  });

  it("has acknowledged, rejected and superseded as terminal (no op is ever deleted)", () => {
    expect([...syncOperationMachine.terminal].sort()).toEqual([
      "acknowledged",
      "rejected",
      "superseded",
    ]);
  });
});
