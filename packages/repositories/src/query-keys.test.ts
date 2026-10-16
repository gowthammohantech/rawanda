import { describe, expect, it } from "vitest";

import { invalidatesFor, MUTATION_INVALIDATIONS, queryKeys } from "./query-keys.ts";

describe("queryKeys", () => {
  it("are hierarchical under the entity root", () => {
    const list = queryKeys.reviews.list({ statuses: ["pending"] });
    expect(list.slice(0, 2)).toEqual(queryKeys.reviews.all);
    expect(queryKeys.patients.detail("p1")).toEqual(["laif", "patients", "detail", "p1"]);
    expect(queryKeys.patients.matches({ q: 1 })[2]).toBe("matches");
    expect(queryKeys.reviews.count()).toEqual(["laif", "reviews", "count", {}]);
    expect(queryKeys.reminders.byPatient("p")).toEqual(["laif", "reminders", "patient", "p"]);
    expect(queryKeys.careInstructions.byPatient("p")[1]).toBe("careInstructions");
    expect(queryKeys.workers.byFacility("f")).toEqual(["laif", "workers", "f"]);
    expect(queryKeys.metrics.aggregate()).toEqual(["laif", "metrics", {}]);
    expect(queryKeys.sync.status()).toEqual(["laif", "sync", "status"]);
    expect(queryKeys.sync.ops()).toEqual(["laif", "sync", "ops", {}]);
    expect(queryKeys.demo.state()).toEqual(["laif", "demo", "state"]);
    expect(queryKeys.demo.faults()).toEqual(["laif", "demo", "faults"]);
  });

  it("mutations invalidate their entities plus audit and sync", () => {
    expect(invalidatesFor("decideReview")).toEqual(
      expect.arrayContaining([
        queryKeys.reviews.all,
        queryKeys.referrals.all,
        queryKeys.audit.all,
        queryKeys.sync.all,
      ]),
    );
    expect(invalidatesFor("recordAuditEvent")).toEqual([queryKeys.audit.all, queryKeys.sync.all]);
    for (const name of Object.keys(MUTATION_INVALIDATIONS) as Array<
      keyof typeof MUTATION_INVALIDATIONS
    >) {
      expect(invalidatesFor(name).length).toBeGreaterThanOrEqual(2);
    }
  });
});
