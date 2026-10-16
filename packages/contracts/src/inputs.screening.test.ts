import { describe, expect, it } from "vitest";

import {
  createScreeningAmendmentInputSchema,
  createScreeningInputSchema,
  ScreeningAmendmentInputSchema,
  ScreeningDraftInputSchema,
} from "./inputs.ts";
import { errorKeys, KEY, LIMITS, NOW, NOW_ISO, VALID_REASON } from "./testing/fixtures.ts";

const schema = createScreeningInputSchema({ limits: LIMITS, now: NOW });

const valid = {
  idempotencyKey: KEY,
  patientId: "pat-000001",
  measuredAt: NOW_ISO,
  systolic: 132,
  diastolic: 84,
  glucoseValue: 6.2,
  glucoseUnit: "mmol/L",
  glucoseContext: "fasting",
  notes: "",
};

describe("ScreeningInputSchema", () => {
  it("accepts a complete screening and normalises offsets to UTC", () => {
    const parsed = schema.parse({ ...valid, measuredAt: "2026-10-14T07:30:00+02:00" });
    expect(parsed.measuredAt).toBe("2026-10-14T05:30:00.000Z");
    expect(parsed.patientId).toBe("pat-000001");
  });

  it("accepts BP only (glucose fields default to null)", () => {
    const bpOnly = {
      ...valid,
      glucoseValue: undefined,
      glucoseUnit: undefined,
      glucoseContext: undefined,
    };
    const parsed = schema.parse(bpOnly);
    expect(parsed.glucoseValue).toBeNull();
    expect(parsed.glucoseUnit).toBeNull();
  });

  it("rejects a glucose value without unit with validation:unitRequired (no English)", () => {
    const result = schema.safeParse({ ...valid, glucoseUnit: null });
    expect(result.success).toBe(false);
    const issue = result.error?.issues.find((i) => i.path[0] === "glucoseUnit");
    expect(issue?.message).toBe("validation:unitRequired");
  });

  it("requires glucose context when a glucose value is present", () => {
    expect(errorKeys(schema, { ...valid, glucoseContext: null })).toEqual({
      glucoseContext: "contextRequired",
    });
  });

  it("checks diastolic < systolic", () => {
    expect(errorKeys(schema, { ...valid, systolic: 120, diastolic: 120 })).toEqual({
      diastolic: "diastolicNotBelowSystolic",
    });
  });

  it("uses plausibility limits (not clinical thresholds) with range params", () => {
    const result = schema.safeParse({ ...valid, systolic: 300 });
    expect(result.error?.issues[0]?.message).toBe(
      'validation:numberOutOfRange|{"min":60,"max":260}',
    );
    expect(errorKeys(schema, { ...valid, diastolic: 10 })).toEqual({
      diastolic: "numberOutOfRange",
    });
    expect(errorKeys(schema, { ...valid, glucoseValue: 700, glucoseUnit: "mg/dL" })).toEqual({
      glucoseValue: "numberOutOfRange",
    });
    expect(errorKeys(schema, { ...valid, glucoseValue: 120, glucoseUnit: "mg/dL" })).toEqual({});
    expect(errorKeys(schema, { ...valid, glucoseValue: 120 })).toEqual({
      glucoseValue: "numberOutOfRange",
    });
  });

  it("requires integer BP values", () => {
    expect(errorKeys(schema, { ...valid, systolic: 132.5 })).toEqual({
      systolic: "integerRequired",
    });
  });

  it("rejects measuredAt more than 5 minutes ahead of the demo clock", () => {
    expect(errorKeys(schema, { ...valid, measuredAt: "2026-10-14T06:04:00.000Z" })).toEqual({});
    expect(errorKeys(schema, { ...valid, measuredAt: "2026-10-14T06:06:00.000Z" })).toEqual({
      measuredAt: "dateInFuture",
    });
  });

  it("rejects measuredAt older than 30 days", () => {
    expect(errorKeys(schema, { ...valid, measuredAt: "2026-09-14T06:00:00.000Z" })).toEqual({});
    const result = schema.safeParse({ ...valid, measuredAt: "2026-09-13T05:59:00.000Z" });
    expect(result.error?.issues[0]?.message).toBe('validation:dateTooOld|{"days":30}');
  });

  it("rejects timestamps without an offset and non-UUID idempotency keys", () => {
    expect(
      errorKeys(schema, { ...valid, measuredAt: "2026-10-14T06:00:00", idempotencyKey: "k1" }),
    ).toEqual({ measuredAt: "invalidDate", idempotencyKey: "invalidIdentifier" });
  });

  it("limits notes to 500 characters", () => {
    expect(errorKeys(schema, { ...valid, notes: "x".repeat(501) })).toEqual({ notes: "tooLong" });
  });

  it("reports missing fields as required", () => {
    expect(errorKeys(schema, { idempotencyKey: KEY })).toEqual({
      patientId: "required",
      measuredAt: "required",
      systolic: "required",
      diastolic: "required",
    });
  });
});

describe("ScreeningDraftInputSchema", () => {
  it("only needs patientId and an idempotency key", () => {
    expect(errorKeys(ScreeningDraftInputSchema, { idempotencyKey: KEY, patientId: "p" })).toEqual(
      {},
    );
    expect(errorKeys(ScreeningDraftInputSchema, { idempotencyKey: KEY })).toEqual({
      patientId: "required",
    });
  });
});

describe("ScreeningAmendmentInputSchema", () => {
  const amendment = {
    idempotencyKey: KEY,
    screeningId: "scr-000001",
    expectedVersion: 2,
    field: "systolic",
    after: 128,
    reason: VALID_REASON,
  };

  it("accepts a valid amendment and requires a reason of 10+ characters", () => {
    expect(errorKeys(ScreeningAmendmentInputSchema, amendment)).toEqual({});
    expect(errorKeys(ScreeningAmendmentInputSchema, { ...amendment, reason: "typo" })).toEqual({
      reason: "reasonTooShort",
    });
  });

  it("types `after` by field", () => {
    expect(errorKeys(ScreeningAmendmentInputSchema, { ...amendment, after: "128" })).toEqual({
      after: "invalidType",
    });
    expect(
      errorKeys(ScreeningAmendmentInputSchema, { ...amendment, field: "glucoseUnit", after: "x" }),
    ).toEqual({ after: "invalidEnum" });
    expect(
      errorKeys(ScreeningAmendmentInputSchema, { ...amendment, field: "bmi", after: 1 }),
    ).toEqual({ field: "invalidEnum" });
  });

  it("applies limits and clock when given", () => {
    const strict = createScreeningAmendmentInputSchema({ limits: LIMITS, now: NOW });
    expect(errorKeys(strict, { ...amendment, after: 999 })).toEqual({ after: "numberOutOfRange" });
    expect(
      errorKeys(strict, {
        ...amendment,
        field: "measuredAt",
        after: "2026-10-15T06:00:00.000Z",
      }),
    ).toEqual({ after: "dateInFuture" });
  });
});
