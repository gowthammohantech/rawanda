/** CLN-02 `clinicalKeys`: facility-scoped keys and invalidation prefixes. */
import { describe, expect, it } from "vitest";

import { clinicalInvalidations, clinicalKeys } from "../queryKeys.ts";

describe("clinicalKeys", () => {
  it("scopes every key by facility", () => {
    expect(clinicalKeys.review("fac-alpha-1", "r1")).toEqual([
      "clinical",
      "fac-alpha-1",
      "review",
      "r1",
    ]);
    expect(clinicalKeys.patients("fac-alpha-1", { q: "a" })).not.toEqual(
      clinicalKeys.patients("fac-alpha-2", { q: "a" }),
    );
    expect(clinicalKeys.workers("f")).toEqual(["clinical", "f", "workers"]);
  });

  it("maps FND-07 mutation invalidations onto clinical prefixes (audit always)", () => {
    const keys = clinicalInvalidations("f", "decideReview").map((key) => key[2]);
    expect(keys).toEqual(
      expect.arrayContaining([
        "reviews",
        "reviewCounts",
        "review",
        "referrals",
        "followUps",
        "screenings",
        "audit",
      ]),
    );
    expect(clinicalInvalidations("f", "recordAuditEvent")).toEqual([["clinical", "f", "audit"]]);
  });

  it("CLN-08: referral writes refresh the list, counts, drawer, eligibility and timeline", () => {
    for (const mutation of ["transitionReferral", "editReferral", "createReferral"] as const) {
      const keys = clinicalInvalidations("f", mutation).map((key) => key[2]);
      expect(keys).toEqual(
        expect.arrayContaining([
          "referrals",
          "referralCounts",
          "referral",
          "referralEligible",
          "patientTimeline",
          "audit",
        ]),
      );
    }
  });
});
