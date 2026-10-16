import { REVIEW_DECISION_INPUT_KINDS } from "@laif/domain";
import { describe, expect, it } from "vitest";

import {
  createReviewDecisionInputSchema,
  ReviewDecisionInputSchema,
  StartReviewInputSchema,
} from "./inputs.ts";
import { errorKeys, KEY, NOW, VALID_REASON } from "./testing/fixtures.ts";

const schema = createReviewDecisionInputSchema({ now: NOW });
const common = { idempotencyKey: KEY, reviewId: "rev-000001", expectedVersion: 3 };
const FUTURE = "2026-10-21T06:00:00.000Z";
const PAST = "2026-10-13T06:00:00.000Z";

/** One valid and one invalid fixture per decision kind, with the expected error keys. */
const fixtures = {
  no_further_action: {
    valid: { ...common, kind: "no_further_action", note: VALID_REASON },
    invalid: { ...common, kind: "no_further_action", note: "fine" },
    errors: { note: "reasonTooShort" },
  },
  refer: {
    valid: {
      ...common,
      kind: "refer",
      destinationFacilityId: "fac-alpha-2",
      referralReason: "Persistently raised readings on repeat",
      dueAt: FUTURE,
      priority: "routine",
    },
    invalid: {
      ...common,
      kind: "refer",
      destinationFacilityId: "fac-alpha-2",
      referralReason: "Persistently raised readings on repeat",
      dueAt: PAST,
      priority: "asap",
    },
    errors: { dueAt: "dateMustBeFuture", priority: "invalidEnum" },
  },
  request_repeat_screening: {
    valid: {
      ...common,
      kind: "request_repeat_screening",
      assignedWorkerId: "persona-chw-1",
      dueAt: FUTURE,
      instructionsForWorker: "Repeat BP after 10 minutes rest",
    },
    invalid: {
      ...common,
      kind: "request_repeat_screening",
      dueAt: FUTURE,
      instructionsForWorker: "BP",
    },
    errors: { assignedWorkerId: "required", instructionsForWorker: "tooShort" },
  },
  plan_follow_up: {
    valid: { ...common, kind: "plan_follow_up", dueAt: FUTURE, note: VALID_REASON },
    invalid: { ...common, kind: "plan_follow_up", note: VALID_REASON },
    errors: { dueAt: "required" },
  },
  dismiss: {
    valid: {
      ...common,
      kind: "dismiss",
      dismissReasonCode: "measurement_error_suspected",
      reason: VALID_REASON,
    },
    invalid: { ...common, kind: "dismiss", dismissReasonCode: "not_a_code", reason: "ok" },
    errors: { dismissReasonCode: "invalidEnum", reason: "reasonTooShort" },
  },
} as const;

describe("ReviewDecisionInputSchema", () => {
  it("covers exactly the five FND-02 decision input kinds", () => {
    expect(Object.keys(fixtures).sort()).toEqual([...REVIEW_DECISION_INPUT_KINDS].sort());
  });

  it.each(Object.entries(fixtures))("%s: valid fixture parses", (_kind, f) => {
    expect(errorKeys(schema, f.valid)).toEqual({});
  });

  it.each(Object.entries(fixtures))("%s: invalid fixture fails with keys", (_kind, f) => {
    expect(errorKeys(schema, f.invalid)).toEqual(f.errors);
  });

  it("dismiss with reason 'ok' fails with validation:reasonTooShort|{\"min\":10}", () => {
    const result = schema.safeParse({ ...fixtures.dismiss.valid, reason: "ok" });
    expect(result.success).toBe(false);
    expect(result.error?.issues.map((i) => i.message)).toEqual([
      'validation:reasonTooShort|{"min":10}',
    ]);
  });

  it("counts non-whitespace characters for the reason minimum", () => {
    expect(errorKeys(schema, { ...fixtures.dismiss.valid, reason: "a b c d e f g h i" })).toEqual({
      reason: "reasonTooShort",
    });
  });

  it("rejects an unknown kind and a missing kind", () => {
    expect(errorKeys(schema, { ...common, kind: "approve" })).toEqual({ kind: "invalidEnum" });
    expect(errorKeys(schema, { ...common })).toEqual({ kind: "required" });
  });

  it("the clock-free schema checks types but not dueAt > now", () => {
    expect(errorKeys(ReviewDecisionInputSchema, fixtures.refer.valid)).toEqual({});
    expect(errorKeys(ReviewDecisionInputSchema, { ...fixtures.refer.valid, dueAt: PAST })).toEqual(
      {},
    );
  });
});

describe("StartReviewInputSchema", () => {
  it("accepts an optional take-over reason of 10+ chars", () => {
    expect(errorKeys(StartReviewInputSchema, common)).toEqual({});
    expect(errorKeys(StartReviewInputSchema, { ...common, takeOverReason: VALID_REASON })).toEqual(
      {},
    );
    expect(errorKeys(StartReviewInputSchema, { ...common, takeOverReason: "mine" })).toEqual({
      takeOverReason: "reasonTooShort",
    });
    expect(errorKeys(StartReviewInputSchema, { ...common, expectedVersion: 0 })).toEqual({
      expectedVersion: "numberOutOfRange",
    });
  });
});
