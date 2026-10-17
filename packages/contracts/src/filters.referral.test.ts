/** CLN-08: `ReferralFilterSchema.q` (referral list search). */
import { describe, expect, it } from "vitest";

import { REVIEW_QUEUE_MAX_QUERY, ReferralFilterSchema } from "./filters.ts";

describe("ReferralFilterSchema.q", () => {
  it("trims q and keeps the other filters", () => {
    expect(ReferralFilterSchema.parse({ q: "  Quavox ", overdueOnly: true })).toMatchObject({
      q: "Quavox",
      overdueOnly: true,
      page: 1,
    });
  });

  it("rejects an over-long query", () => {
    expect(
      ReferralFilterSchema.safeParse({ q: "x".repeat(REVIEW_QUEUE_MAX_QUERY + 1) }).success,
    ).toBe(false);
  });
});
