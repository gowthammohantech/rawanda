/** CLN-05 `ReviewQueueFilterSchema` (URL state) and the queue extensions of `ReviewFilterSchema`. */
import { describe, expect, it } from "vitest";

import { ReviewFilterSchema, ReviewQueueFilterSchema } from "./filters.ts";

describe("ReviewQueueFilterSchema", () => {
  it("defaults: pending tab, any assignee, oldest flag first, page 1", () => {
    expect(ReviewQueueFilterSchema.parse({})).toEqual({
      tab: "pending",
      assignee: "any",
      sort: "flaggedAt_asc",
      page: 1,
    });
  });

  it("parses URL values (coerced page, trimmed q)", () => {
    expect(
      ReviewQueueFilterSchema.parse({
        tab: "overdue",
        facilityId: "fac-alpha-2",
        assignee: "unassigned",
        q: "  DEMO-P ",
        sort: "dueAt_asc",
        page: "2",
      }),
    ).toEqual({
      tab: "overdue",
      facilityId: "fac-alpha-2",
      assignee: "unassigned",
      q: "DEMO-P",
      sort: "dueAt_asc",
      page: 2,
    });
  });

  it("rejects unknown tabs / sorts / assignees, page 0 and a query over 60 characters", () => {
    for (const bad of [
      { tab: "later" },
      { sort: "risk_desc" },
      { assignee: "everyone" },
      { page: "0" },
      { q: "x".repeat(61) },
    ]) {
      expect(ReviewQueueFilterSchema.safeParse(bad).success).toBe(false);
    }
  });
});

describe("ReviewFilterSchema queue extensions", () => {
  it("accepts tab, q, sort and decidedSince (all optional)", () => {
    expect(ReviewFilterSchema.parse({}).tab).toBeUndefined();
    const parsed = ReviewFilterSchema.parse({
      tab: "assigned",
      q: " Quavox ",
      sort: "patient_asc",
      decidedSince: "2026-10-11T22:00:00.000Z",
    });
    expect(parsed).toMatchObject({ tab: "assigned", q: "Quavox", sort: "patient_asc" });
    expect(ReviewFilterSchema.safeParse({ decidedSince: "yesterday" }).success).toBe(false);
  });
});
