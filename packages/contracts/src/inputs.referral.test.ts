import { describe, expect, it } from "vitest";

import {
  createReferralTransitionInputSchema,
  ReferralEditInputSchema,
  ReferralInputSchema,
  ReferralTransitionInputSchema,
} from "./inputs.ts";
import { errorKeys, KEY, NOW, VALID_REASON } from "./testing/fixtures.ts";

const transition = createReferralTransitionInputSchema({ now: NOW });
const common = { idempotencyKey: KEY, referralId: "ref-000001", expectedVersion: 2 };
const completed = {
  ...common,
  to: "completed",
  completedAt: "2026-10-13T09:00:00+02:00",
  outcome: "attended_seen",
  evidenceType: "facility_attendance_record",
  evidenceReference: "REG-2026-104",
};

describe("ReferralTransitionInputSchema", () => {
  it("accepts every transition target", () => {
    expect(errorKeys(transition, { ...common, to: "accepted" })).toEqual({});
    expect(
      errorKeys(transition, { ...common, to: "scheduled", appointmentAt: "2026-10-20T07:00:00Z" }),
    ).toEqual({});
    expect(errorKeys(transition, completed)).toEqual({});
    expect(
      errorKeys(transition, {
        ...common,
        to: "cancelled_with_reason",
        cancelReasonCode: "patient_declined",
        reason: VALID_REASON,
      }),
    ).toEqual({});
  });

  it("normalises completedAt to UTC", () => {
    const parsed = transition.parse(completed);
    expect(parsed.to === "completed" && parsed.completedAt).toBe("2026-10-13T07:00:00.000Z");
  });

  it("completion without evidence fails with validation:evidenceRequired", () => {
    const noEvidence = { ...completed, evidenceType: undefined, evidenceReference: undefined };
    const result = transition.safeParse(noEvidence);
    expect(result.success).toBe(false);
    const messages = Object.fromEntries(
      (result.error?.issues ?? []).map((i) => [i.path.join("."), i.message]),
    );
    expect(messages).toEqual({
      evidenceType: "validation:evidenceRequired",
      evidenceReference: "validation:evidenceRequired",
    });
  });

  it("restricts evidence to referral evidence types and checks the reference length", () => {
    expect(
      errorKeys(transition, {
        ...completed,
        evidenceType: "patient_verbal_confirmation",
        evidenceReference: "ab",
      }),
    ).toEqual({ evidenceType: "invalidEnum", evidenceReference: "tooShort" });
    expect(errorKeys(transition, { ...completed, evidenceReference: "x".repeat(101) })).toEqual({
      evidenceReference: "tooLong",
    });
  });

  it("requires completedAt ≤ demo now and an outcome", () => {
    const noOutcome = { ...completed, outcome: undefined };
    expect(
      errorKeys(transition, { ...noOutcome, completedAt: "2026-10-15T06:00:00.000Z" }),
    ).toEqual({ completedAt: "dateInFuture", outcome: "required" });
  });

  it("cancellation needs a code and a 10+ char reason", () => {
    expect(errorKeys(transition, { ...common, to: "cancelled_with_reason", reason: "no" })).toEqual(
      { cancelReasonCode: "required", reason: "reasonTooShort" },
    );
  });

  it("rejects transitions to created / unknown targets", () => {
    expect(errorKeys(ReferralTransitionInputSchema, { ...common, to: "created" })).toEqual({
      to: "invalidEnum",
    });
  });
});

describe("ReferralInputSchema / ReferralEditInputSchema", () => {
  const referral = {
    idempotencyKey: KEY,
    reviewId: "rev-000001",
    patientId: "pat-000001",
    destinationFacilityId: "fac-alpha-2",
    dueAt: "2026-10-20T06:00:00.000Z",
    priority: "urgent_demo",
    referralReason: "Repeat raised readings on two visits",
  };

  it("validates a new referral", () => {
    expect(errorKeys(ReferralInputSchema, referral)).toEqual({});
    expect(errorKeys(ReferralInputSchema, { ...referral, referralReason: "BP" })).toEqual({
      referralReason: "reasonTooShort",
    });
  });

  it("edit needs a change reason and at least one change", () => {
    const edit = { idempotencyKey: KEY, referralId: "ref-1", expectedVersion: 1 };
    expect(
      errorKeys(ReferralEditInputSchema, {
        ...edit,
        dueAt: referral.dueAt,
        changeReason: VALID_REASON,
      }),
    ).toEqual({});
    expect(errorKeys(ReferralEditInputSchema, { ...edit, changeReason: VALID_REASON })).toEqual({
      _root: "noChanges",
    });
    expect(errorKeys(ReferralEditInputSchema, { ...edit, dueAt: referral.dueAt })).toEqual({
      changeReason: "required",
    });
  });
});
