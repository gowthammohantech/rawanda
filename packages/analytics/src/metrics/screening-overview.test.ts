import { createDemoClock } from "@laif/domain";
import { createSeed, DISTRICT_IDS, FACILITY_IDS } from "@laif/mock-data";
import { describe, expect, it } from "vitest";

import { screeningOverview } from "./screening-overview.ts";

const seed = createSeed();
const now = createDemoClock().now();

describe("screeningOverview", () => {
  const o = screeningOverview(seed, {}, now);

  it("counts the baseline seed", () => {
    const recorded = seed.screenings.filter((s) => s.status !== "draft");
    expect(o.screeningsRecorded).toBe(57);
    expect(o.screeningsFlagged).toBe(20);
    expect(o.distinctPatientsScreened).toBe(new Set(recorded.map((s) => s.patientId)).size);
    expect(o.flaggedRate).toBe(Math.round((20 / 57) * 1e4) / 1e4);
    expect(o.reviewsCompleted).toBe(15);
    expect(o.reviewsDismissed).toBe(3);
    expect(o.reviewsPending).toBe(5);
    expect(o.referralsCompleted).toBe(4);
    expect(o.followUpsCompleted).toBe(6);
  });

  it("breaks down by facility and district with consistent sums", () => {
    expect(
      o.byFacility.map((f) => [f.facilityId, f.screeningsRecorded, f.screeningsFlagged]),
    ).toEqual([
      [FACILITY_IDS.alpha1, 22, 9],
      [FACILITY_IDS.alpha2, 18, 7],
      [FACILITY_IDS.beta1, 17, 4],
    ]);
    expect(o.byDistrict.map((d) => [d.districtId, d.screeningsRecorded])).toEqual([
      [DISTRICT_IDS.alpha, 40],
      [DISTRICT_IDS.beta, 17],
    ]);
  });

  it("applies scope filters", () => {
    const beta = screeningOverview(seed, { districtIds: [DISTRICT_IDS.beta] }, now);
    expect(beta.screeningsRecorded).toBe(17);
    expect(beta.byFacility.map((f) => f.facilityId)).toEqual([FACILITY_IDS.beta1]);
    expect(beta.byDistrict.map((d) => d.districtId)).toEqual([DISTRICT_IDS.beta]);
    expect(beta.followUpsCompleted).toBe(1);
    const mismatch = screeningOverview(
      seed,
      { districtIds: [DISTRICT_IDS.beta], facilityIds: [FACILITY_IDS.alpha1] },
      now,
    );
    expect(mismatch.screeningsRecorded).toBe(0);
    expect(mismatch.byFacility).toEqual([]);
  });

  it("empty results are zeros, not errors", () => {
    const empty = screeningOverview(seed, { from: "2030-01-01", to: "2030-01-02" }, now);
    expect(empty).toMatchObject({
      screeningsRecorded: 0,
      distinctPatientsScreened: 0,
      screeningsFlagged: 0,
      flaggedRate: null,
      reviewsPending: 0,
      followUpsCompleted: 0,
    });
    expect(empty.byFacility.every((f) => f.screeningsRecorded === 0)).toBe(true);
  });
});
