import { FOLLOW_UP_ACTIONS } from "@laif/domain";
import { describe, expect, it } from "vitest";

import { FollowUpInputSchema, FollowUpUpdateInputSchema } from "./inputs.ts";
import { errorKeys, KEY, NOW_ISO, VALID_REASON } from "./testing/fixtures.ts";

const common = { idempotencyKey: KEY, followUpId: "fu-000001", expectedVersion: 4 };
const DUE = "2026-10-20T06:00:00.000Z";

const validByAction = {
  assign: { ...common, action: "assign", assignedWorkerId: "persona-chw-1", dueAt: DUE },
  reassign: {
    ...common,
    action: "reassign",
    assignedWorkerId: "persona-chw-2",
    reason: VALID_REASON,
  },
  set_due_date: { ...common, action: "set_due_date", dueAt: DUE, reason: VALID_REASON },
  record_attempt: {
    ...common,
    action: "record_attempt",
    at: NOW_ISO,
    method: "home_visit",
    result: "not_reached",
    durationMinutes: 15,
  },
  record_outcome: {
    ...common,
    action: "record_outcome",
    outcome: "attended",
    occurredAt: NOW_ISO,
    evidenceType: "appointment_card_seen",
  },
  add_note: { ...common, action: "add_note", note: "Called the family" },
  confirm_completion: { ...common, action: "confirm_completion" },
  return_to_worker: { ...common, action: "return_to_worker", reason: VALID_REASON },
} as const;

describe("FollowUpUpdateInputSchema", () => {
  it("is aligned with FND-02 FOLLOW_UP_ACTIONS", () => {
    expect(Object.keys(validByAction)).toEqual([...FOLLOW_UP_ACTIONS]);
  });

  it.each(Object.entries(validByAction))("%s: valid fixture parses", (_action, input) => {
    expect(errorKeys(FollowUpUpdateInputSchema, input)).toEqual({});
  });

  it.each([
    [{ ...validByAction.assign, assignedWorkerId: undefined }, { assignedWorkerId: "required" }],
    [{ ...validByAction.reassign, reason: "busy" }, { reason: "reasonTooShort" }],
    [{ ...validByAction.set_due_date, dueAt: "next week" }, { dueAt: "invalidDate" }],
    [{ ...validByAction.record_attempt, method: "sms" }, { method: "invalidEnum" }],
    [
      { ...validByAction.record_attempt, durationMinutes: 1.5 },
      { durationMinutes: "integerRequired" },
    ],
    [{ ...validByAction.add_note, note: "ok" }, { note: "tooShort" }],
    [{ ...validByAction.add_note, note: "x".repeat(501) }, { note: "tooLong" }],
    [{ ...validByAction.return_to_worker, reason: undefined }, { reason: "required" }],
    [
      { ...validByAction.confirm_completion, expectedVersion: "4" },
      { expectedVersion: "invalidType" },
    ],
  ])("invalid fixture %# fails", (input, expected) => {
    expect(errorKeys(FollowUpUpdateInputSchema, input)).toEqual(expected);
  });

  it.each(["attended", "repeat_screening_done", "referred_onward"])(
    "record_outcome %s requires an evidence type",
    (outcome) => {
      const rest = { ...validByAction.record_outcome, evidenceType: undefined };
      expect(errorKeys(FollowUpUpdateInputSchema, { ...rest, outcome })).toEqual({
        evidenceType: "evidenceTypeRequired",
      });
    },
  );

  it("record_outcome unable_to_reach requires a reason code, declined needs neither", () => {
    const rest = { ...validByAction.record_outcome, evidenceType: undefined };
    expect(errorKeys(FollowUpUpdateInputSchema, { ...rest, outcome: "unable_to_reach" })).toEqual({
      reasonCode: "required",
    });
    expect(
      errorKeys(FollowUpUpdateInputSchema, {
        ...rest,
        outcome: "unable_to_reach",
        reasonCode: "moved_away",
      }),
    ).toEqual({});
    expect(errorKeys(FollowUpUpdateInputSchema, { ...rest, outcome: "declined" })).toEqual({});
  });

  it("rejects an unknown action", () => {
    expect(errorKeys(FollowUpUpdateInputSchema, { ...common, action: "close" })).toEqual({
      action: "invalidEnum",
    });
  });
});

describe("FollowUpInputSchema", () => {
  it("creates a follow-up with purpose and due date", () => {
    const input = {
      idempotencyKey: KEY,
      patientId: "pat-1",
      purpose: "planned_review",
      dueAt: DUE,
    };
    expect(errorKeys(FollowUpInputSchema, input)).toEqual({});
    expect(errorKeys(FollowUpInputSchema, { ...input, purpose: "overdue" })).toEqual({
      purpose: "invalidEnum",
    });
  });
});
