/**
 * CLN-05 review-queue predicates with a pinned demo clock: `overdue` is derived from the fixture
 * `reviewDueAt` only (never stored, never invented when absent) and moves with the demo clock.
 */
import { describe, expect, it } from "vitest";

import { createDemoClock, DEMO_CLOCK_DEFAULT_ISO } from "./clock/clock.ts";
import { asId, type PersonaId } from "./ids.ts";
import {
  isReviewOpen,
  matchesReviewQueueTab,
  REVIEW_QUEUE_SORTS,
  REVIEW_QUEUE_TABS,
  reviewQueuePredicates,
} from "./queue.ts";

const me = asId<PersonaId>("persona-clin-alpha1");
const other = asId<PersonaId>("persona-nurse-alpha2");
const clock = createDemoClock({ pinnedIso: DEMO_CLOCK_DEFAULT_ISO, mode: "frozen" });
const ctx = () => ({ now: clock.now(), personaId: me });

const base = {
  status: "pending" as const,
  priority: "routine" as const,
  reviewDueAt: null as string | null,
  assignedClinicianId: null as PersonaId | null,
};

describe("reviewQueuePredicates (pinned demo clock)", () => {
  it("exposes one predicate per tab and the four sort orders", () => {
    expect(Object.keys(reviewQueuePredicates)).toEqual([...REVIEW_QUEUE_TABS]);
    expect(REVIEW_QUEUE_SORTS).toEqual([
      "flaggedAt_asc",
      "flaggedAt_desc",
      "dueAt_asc",
      "patient_asc",
    ]);
  });

  it("overdue is derived: past due → overdue; future due → not; no due date → never", () => {
    const past = { ...base, reviewDueAt: "2026-10-13T10:52:00.000Z" };
    const future = { ...base, reviewDueAt: "2026-10-15T08:28:00.000Z" };
    expect(reviewQueuePredicates.overdue(past, ctx())).toBe(true);
    expect(reviewQueuePredicates.overdue(future, ctx())).toBe(false);
    expect(reviewQueuePredicates.overdue(base, ctx())).toBe(false);
  });

  it("overdue follows the demo clock (not wall time)", () => {
    const due = { ...base, reviewDueAt: "2026-10-14T08:00:00.000Z" };
    const travelling = createDemoClock({ pinnedIso: DEMO_CLOCK_DEFAULT_ISO, mode: "frozen" });
    const at = () => ({ now: travelling.now(), personaId: me });
    expect(matchesReviewQueueTab(due, "overdue", at())).toBe(false);
    travelling.advanceBy(2 * 60 * 60 * 1000); // exactly due → still not overdue
    expect(matchesReviewQueueTab(due, "overdue", at())).toBe(false);
    travelling.advanceBy(1000);
    expect(matchesReviewQueueTab(due, "overdue", at())).toBe(true);
    travelling.reset();
    expect(matchesReviewQueueTab(due, "overdue", at())).toBe(false);
  });

  it("decided reviews are never overdue / urgent / assigned, only `all`", () => {
    for (const status of ["action_recorded", "dismissed_with_reason"] as const) {
      const decided = {
        ...base,
        status,
        priority: "urgent_demo" as const,
        reviewDueAt: "2026-10-01T00:00:00.000Z",
        assignedClinicianId: me,
      };
      expect(isReviewOpen(decided)).toBe(false);
      expect(REVIEW_QUEUE_TABS.filter((tab) => reviewQueuePredicates[tab](decided, ctx()))).toEqual(
        ["all"],
      );
    }
  });

  it("in_review counts as pending; urgent needs urgent_demo; assigned needs the persona", () => {
    const inReview = { ...base, status: "in_review" as const, assignedClinicianId: other };
    expect(reviewQueuePredicates.pending(inReview, ctx())).toBe(true);
    expect(reviewQueuePredicates.urgent(inReview, ctx())).toBe(false);
    expect(reviewQueuePredicates.assigned(inReview, ctx())).toBe(false);
    const mine = { ...inReview, assignedClinicianId: me, priority: "urgent_demo" as const };
    expect(reviewQueuePredicates.urgent(mine, ctx())).toBe(true);
    expect(reviewQueuePredicates.assigned(mine, ctx())).toBe(true);
  });
});
