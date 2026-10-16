import { isFollowUpOverdue, isReferralOverdue } from "@laif/domain";
import { describe, expect, it } from "vitest";

import { SEED_IDS } from "./ids.ts";
import { createSeed } from "./generate.ts";

const seed = createSeed();
const now = new Date(seed.meta.demoClockIso);
const countBy = <T>(items: readonly T[], key: (item: T) => string): Record<string, number> =>
  items.reduce<Record<string, number>>((acc, item) => {
    const k = key(item);
    acc[k] = (acc[k] ?? 0) + 1;
    return acc;
  }, {});

describe("seed counts (FND-05 task 4)", () => {
  it("has 48 patients split 18 / 14 / 16, 3 facilities and 2 districts", () => {
    expect(seed.patients).toHaveLength(48);
    expect(seed.patients.length).toBeGreaterThanOrEqual(40);
    expect(countBy(seed.patients, (p) => p.facilityId)).toEqual({
      [SEED_IDS.facilities.alpha1]: 18,
      [SEED_IDS.facilities.alpha2]: 14,
      [SEED_IDS.facilities.beta1]: 16,
    });
    expect(seed.facilities).toHaveLength(3);
    expect(seed.districts).toHaveLength(2);
  });

  it("has 60 screenings: 20 review_required, 37 no_review_required, 3 draft", () => {
    expect(seed.screenings).toHaveLength(60);
    expect(countBy(seed.screenings, (s) => s.status)).toEqual({
      review_required: 20,
      no_review_required: 37,
      draft: 3,
    });
  });

  it("has 20 reviews: 4 pending, 1 in_review, 12 action_recorded, 3 dismissed", () => {
    expect(seed.reviews).toHaveLength(20);
    expect(countBy(seed.reviews, (r) => r.status)).toEqual({
      pending: 4,
      in_review: 1,
      action_recorded: 12,
      dismissed_with_reason: 3,
    });
    const actions = seed.reviews.filter((r) => r.status === "action_recorded");
    expect(countBy(actions, (r) => r.decision?.kind ?? "none")).toEqual({
      refer: 11,
      plan_follow_up: 1,
    });
    expect(seed.reviews.some((r) => r.decision?.kind === "request_repeat_screening")).toBe(false);
  });

  it("has 12 referrals: 2 created, 2 accepted, 3 scheduled (1 past due), 4 completed, 1 cancelled", () => {
    expect(seed.referrals).toHaveLength(12);
    expect(countBy(seed.referrals, (r) => r.status)).toEqual({
      created: 2,
      accepted: 2,
      scheduled: 3,
      completed: 4,
      cancelled_with_reason: 1,
    });
    const scheduled = seed.referrals.filter((r) => r.status === "scheduled");
    expect(scheduled.filter((r) => isReferralOverdue(r, now))).toHaveLength(1);
    for (const r of seed.referrals.filter((x) => x.status === "completed")) {
      expect(r.completionEvidence).not.toBeNull();
    }
    const cancelled = seed.referrals.find((r) => r.status === "cancelled_with_reason");
    const replacement = seed.referrals.filter(
      (r) => r.reviewId === cancelled?.reviewId && r.id !== cancelled.id,
    );
    expect(replacement).toHaveLength(1);
    expect(Date.parse(replacement[0]?.requestedAt ?? "")).toBeGreaterThan(
      Date.parse(cancelled?.updatedAt ?? ""),
    );
  });

  it("has 18 follow-ups with the fixed purposes and statuses", () => {
    expect(seed.followUps).toHaveLength(18);
    expect(countBy(seed.followUps, (f) => f.purpose)).toEqual({
      referral_attendance: 11,
      planned_review: 1,
      post_referral_check: 6,
    });
    expect(countBy(seed.followUps, (f) => f.status)).toEqual({
      assigned: 5,
      contacted: 3,
      completed: 6,
      unable_to_reach: 2,
      reassigned: 2,
    });
    const assigned = seed.followUps.filter((f) => f.status === "assigned");
    expect(assigned.filter((f) => isFollowUpOverdue(f, now))).toHaveLength(2);
  });

  it("has one referral_attendance follow-up per non-cancelled referral", () => {
    const attendance = seed.followUps.filter((f) => f.purpose === "referral_attendance");
    const open = seed.referrals.filter((r) => r.status !== "cancelled_with_reason");
    expect(attendance.map((f) => f.referralId).sort()).toEqual(open.map((r) => r.id).sort());
    const planned = seed.followUps.find((f) => f.purpose === "planned_review");
    const planReview = seed.reviews.find((r) => r.decision?.kind === "plan_follow_up");
    expect(planned?.reviewId).toBe(planReview?.id);
    for (const pc of seed.followUps.filter((f) => f.purpose === "post_referral_check")) {
      const ref = seed.referrals.find((r) => r.id === pc.referralId);
      expect(["completed", "scheduled"]).toContain(ref?.status);
    }
  });

  it("has every review linked to a review_required screening (one each)", () => {
    const flagged = seed.screenings.filter((s) => s.status === "review_required").map((s) => s.id);
    expect(seed.reviews.map((r) => r.screeningId).sort()).toEqual([...flagged].sort());
  });

  it("has the additional records of task 5", () => {
    expect(countBy(seed.careTasks, (t) => t.kind)).toEqual({
      correction_request: 2,
      follow_up_assignment: 2,
      programme_action: 1,
      data_quality: 1,
    });
    expect(
      seed.careTasks.some(
        (t) => t.kind === "correction_request" && t.createdBy === "persona-citizen-1",
      ),
    ).toBe(true);
    expect(seed.reminders).toHaveLength(8);
    expect(countBy(seed.careInstructions, (c) => c.status)).toEqual({ released: 6, withdrawn: 1 });
    expect(seed.patients.filter((p) => p.identityStatus === "possible_duplicate")).toHaveLength(2);
    expect(seed.screenings.filter((s) => s.amendments.length > 0)).toHaveLength(1);
    const pendingConfirmation = seed.followUps.filter(
      (f) => f.status === "completed" && f.clinicianConfirmation.status === "pending",
    );
    expect(pendingConfirmation).toHaveLength(1);
    for (const attempt of seed.followUps.flatMap((f) => f.attempts)) {
      expect(attempt.durationMinutes).toEqual(expect.any(Number));
    }
    expect(seed.rulesets).toHaveLength(1);
    expect(seed.syncOperations).toEqual([]);
  });

  it("has reminder preferences for exactly the patients with a citizen persona", () => {
    const citizenPatients = seed.personas
      .filter((p) => p.role === "citizen")
      .flatMap((p) => p.linkedPatientIds);
    expect(seed.reminderPreferences.map((r) => r.patientId).sort()).toEqual(
      [...citizenPatients].sort(),
    );
  });

  it("puts 1–4 completed follow-ups in Beta-1 (SCN-12 small cell)", () => {
    const n = seed.followUps.filter(
      (f) => f.facilityId === SEED_IDS.facilities.beta1 && f.status === "completed",
    ).length;
    expect(n).toBeGreaterThanOrEqual(1);
    expect(n).toBeLessThanOrEqual(4);
  });
});
