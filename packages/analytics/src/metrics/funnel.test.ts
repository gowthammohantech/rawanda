import { createDemoClock } from "@laif/domain";
import { createSeed, DISTRICT_IDS } from "@laif/mock-data";
import { describe, expect, it } from "vitest";

import { classifyPathway, FUNNEL_STAGES, funnelCount, pathwayFunnel } from "./funnel.ts";

const seed = createSeed();
const now = createDemoClock().now();

/** Naive, independent recomputation straight from the seed arrays. */
function naive() {
  const recorded = seed.screenings.filter((s) => s.status !== "draft");
  const flagged = recorded.filter((s) => s.status === "review_required");
  const reviewOf = (sid: string) => seed.reviews.filter((r) => r.screeningId === sid);
  const reviewed = flagged.filter((s) =>
    reviewOf(s.id).some((r) => ["action_recorded", "dismissed_with_reason"].includes(r.status)),
  );
  const dismissed = flagged.filter((s) =>
    reviewOf(s.id).some((r) => r.status === "dismissed_with_reason"),
  );
  const referred = flagged.filter((s) =>
    reviewOf(s.id).some(
      (r) =>
        r.status === "action_recorded" &&
        (seed.referrals.some((x) => x.reviewId === r.id && x.status !== "cancelled_with_reason") ||
          seed.followUps.some((f) => f.reviewId === r.id)),
    ),
  );
  const completed = referred.filter((s) =>
    reviewOf(s.id).some(
      (r) =>
        seed.referrals.some(
          (x) =>
            x.reviewId === r.id &&
            x.status === "completed" &&
            x.completionEvidence !== null &&
            x.completedAt !== null,
        ) ||
        seed.followUps.some(
          (f) =>
            f.reviewId === r.id &&
            f.status === "completed" &&
            f.completedAt !== null &&
            f.outcome !== null &&
            f.outcome.evidenceType !== null,
        ),
    ),
  );
  return { recorded, flagged, reviewed, dismissed, referred, completed };
}

describe("pathwayFunnel on the baseline seed", () => {
  const funnel = pathwayFunnel(seed, {}, now);
  const n = naive();

  it("matches the pinned FND-05 counts", () => {
    expect(funnel.stages.map((s) => [s.stage, s.count])).toEqual([
      ["recorded", 57],
      ["flagged", 20],
      ["reviewed", 15],
      ["referred", 12],
      ["completed", n.completed.length],
    ]);
    expect(funnel.dismissed.count).toBe(3);
  });

  it("referred = 11 refer + 1 plan_follow_up decisions", () => {
    const kinds = seed.reviews
      .filter((r) => r.status === "action_recorded" && r.decision !== null)
      .map((r) => r.decision!.kind);
    expect(kinds.filter((k) => k === "refer")).toHaveLength(11);
    expect(kinds.filter((k) => k === "plan_follow_up")).toHaveLength(1);
    expect(funnelCount(funnel, "referred")).toBe(12);
  });

  it("equals an independent naive computation for every stage", () => {
    expect(funnelCount(funnel, "recorded")).toBe(n.recorded.length);
    expect(funnelCount(funnel, "flagged")).toBe(n.flagged.length);
    expect(funnelCount(funnel, "reviewed")).toBe(n.reviewed.length);
    expect(funnelCount(funnel, "referred")).toBe(n.referred.length);
    expect(funnelCount(funnel, "completed")).toBe(n.completed.length);
    expect(n.completed.length).toBeGreaterThan(0);
  });

  it("dismissed is never counted as completed or referred", () => {
    const sets = classifyPathway(seed);
    for (const id of sets.dismissed) {
      expect(sets.completed.has(id)).toBe(false);
      expect(sets.referred.has(id)).toBe(false);
    }
  });

  it("carries rateFromPrevious per stage and the dismissal rate", () => {
    expect(funnel.stages[0]!.rateFromPrevious).toBeNull();
    expect(funnel.stages[1]!.rateFromPrevious).toBe(Math.round((20 / 57) * 1e4) / 1e4);
    expect(funnel.stages[2]!.rateFromPrevious).toBe(0.75);
    expect(funnel.stages[3]!.rateFromPrevious).toBe(0.8);
    expect(funnel.dismissed.rateFromFlagged).toBe(0.15);
    expect(funnel.stages.map((s) => s.metricKey)).toEqual([
      "screenings_recorded",
      "screenings_flagged",
      "reviews_completed",
      "pathway_referred",
      "pathway_completed",
    ]);
  });

  it("is deterministic and does not depend on time", () => {
    expect(pathwayFunnel(createSeed(), {}, now)).toEqual(funnel);
    expect(pathwayFunnel(seed, {}, new Date("2030-01-01T00:00:00.000Z"))).toEqual(funnel);
  });

  it("district filters partition the stages", () => {
    const a = pathwayFunnel(seed, { districtIds: [DISTRICT_IDS.alpha] }, now);
    const b = pathwayFunnel(seed, { districtIds: [DISTRICT_IDS.beta] }, now);
    for (const stage of FUNNEL_STAGES) {
      expect(funnelCount(a, stage) + funnelCount(b, stage)).toBe(funnelCount(funnel, stage));
    }
  });

  it("an empty filter result yields zero counts and null rates", () => {
    const empty = pathwayFunnel(seed, { from: "2000-01-01", to: "2000-01-31" }, now);
    expect(empty.stages.every((s) => s.count === 0)).toBe(true);
    expect(empty.stages.every((s) => s.rateFromPrevious === null)).toBe(true);
    expect(empty.dismissed).toEqual({
      metricKey: "reviews_dismissed",
      count: 0,
      rateFromFlagged: null,
    });
  });
});
