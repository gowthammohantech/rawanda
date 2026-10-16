import { createDemoClock } from "@laif/domain";
import { applyScenario, createSeed, DISTRICT_IDS } from "@laif/mock-data";
import { describe, expect, it } from "vitest";

import { dataQuality } from "./quality.ts";

const seed = createSeed();
const now = createDemoClock().now();

describe("dataQuality", () => {
  it("counts the baseline seed issues", () => {
    const q = dataQuality(seed, {}, now);
    expect(q).toEqual({
      missingGlucoseUnit: seed.screenings.filter(
        (s) => s.status !== "draft" && s.glucoseValue !== null && s.glucoseUnit === null,
      ).length,
      possibleDuplicateIdentities: seed.patients.filter(
        (p) => p.identityStatus === "possible_duplicate",
      ).length,
      flagsOverturnedAtReview: 3,
      screeningAmendments: seed.screenings.reduce((n, s) => n + s.amendments.length, 0),
      amendedScreenings: seed.screenings.filter((s) => s.amendments.length > 0).length,
    });
    expect(q.missingGlucoseUnit).toBe(1); // the draft with a missing unit is excluded
    expect(q.possibleDuplicateIdentities).toBe(2);
  });

  it("is scoped by the filter and stable under scenarios without data changes", () => {
    const a = dataQuality(seed, { districtIds: [DISTRICT_IDS.alpha] }, now);
    const b = dataQuality(seed, { districtIds: [DISTRICT_IDS.beta] }, now);
    const all = dataQuality(seed, {}, now);
    expect(a.flagsOverturnedAtReview + b.flagsOverturnedAtReview).toBe(all.flagsOverturnedAtReview);
    expect(a.possibleDuplicateIdentities + b.possibleDuplicateIdentities).toBe(
      all.possibleDuplicateIdentities,
    );
    const scn = applyScenario(seed, "SCN-12-suppressed-small-aggregate");
    expect(dataQuality(scn, {}, now)).toEqual(all);
  });
});
