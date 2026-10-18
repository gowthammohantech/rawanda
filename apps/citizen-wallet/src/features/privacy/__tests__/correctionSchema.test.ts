/**
 * CTZ-07 correction form schema: required target (unless personal details), description 10–500
 * (trimmed), suggestion ≤ 200, the "I understand" tick; every message is a
 * `citizen:validation.correction.*` key with EN and RW copy (T-03).
 */
import { createTestI18n } from "@laif/i18n";
import { describe, expect, it } from "vitest";

import {
  CORRECTION_MESSAGES,
  correctionDetailsSchema,
  correctionErrorsOf,
  correctionSchema,
  correctionTargetSchema,
} from "../correctionSchema.ts";

const valid = {
  targetType: "screening",
  targetId: "scr-1",
  description: "The time of this check looks wrong.",
  suggestedValue: "",
  understood: true,
};

const errorsOf = (schema: { safeParse: (v: unknown) => unknown }, value: unknown) => {
  const result = schema.safeParse(value) as
    { success: true } | { success: false; error: Parameters<typeof correctionErrorsOf>[0] };
  return result.success ? {} : correctionErrorsOf(result.error);
};

describe("correctionSchema", () => {
  it("accepts a complete request and trims the citizen's text", () => {
    const parsed = correctionSchema.parse({ ...valid, description: "   Wrong time on it.   " });
    expect(parsed.description).toBe("Wrong time on it.");
    expect(
      correctionSchema.safeParse({ ...valid, targetType: "patient", targetId: "" }).success,
    ).toBe(true);
  });

  it("maps each rule to its translated key", () => {
    expect(errorsOf(correctionTargetSchema, { targetType: undefined, targetId: "" })).toEqual({
      targetId: CORRECTION_MESSAGES.targetRequired,
    });
    expect(errorsOf(correctionTargetSchema, { targetType: "screening", targetId: " " })).toEqual({
      targetId: CORRECTION_MESSAGES.targetRequired,
    });
    expect(
      errorsOf(correctionDetailsSchema, {
        description: "abc",
        suggestedValue: "",
        understood: false,
      }),
    ).toEqual({
      description: CORRECTION_MESSAGES.descriptionMin,
      understood: CORRECTION_MESSAGES.mustUnderstand,
    });
    // 9 letters after trimming is still too short.
    expect(
      errorsOf(correctionDetailsSchema, {
        description: "   123456789   ",
        suggestedValue: "",
        understood: true,
      }),
    ).toEqual({ description: CORRECTION_MESSAGES.descriptionMin });
    expect(
      errorsOf(correctionDetailsSchema, {
        description: "x".repeat(501),
        suggestedValue: "y".repeat(201),
        understood: true,
      }),
    ).toEqual({
      description: CORRECTION_MESSAGES.descriptionMax,
      suggestedValue: CORRECTION_MESSAGES.suggestedMax,
    });
    expect(
      errorsOf(correctionDetailsSchema, {
        description: "x".repeat(500),
        suggestedValue: "y".repeat(200),
        understood: true,
      }),
    ).toEqual({});
  });

  it("every message has EN and RW copy (never a raw key)", () => {
    const en = createTestI18n("en", { appId: "citizen" });
    const rw = createTestI18n("rw", { appId: "citizen" });
    expect(en.t(CORRECTION_MESSAGES.descriptionMin)).toBe(
      "Please tell us a little more (at least 10 letters).",
    );
    expect(en.t(CORRECTION_MESSAGES.mustUnderstand)).toBe("Please tick the box to continue.");
    expect(rw.t(CORRECTION_MESSAGES.descriptionMin)).toBe(
      "Twongerere ibisobanuro (nibura inyuguti 10).",
    );
    expect(rw.t(CORRECTION_MESSAGES.mustUnderstand)).toBe("Kanda ku kazu kugira ngo ukomeze.");
    for (const key of Object.values(CORRECTION_MESSAGES)) {
      const [, path] = key.split(":");
      for (const i of [en, rw]) {
        const text = i.t(key);
        expect(text, key).not.toBe(key);
        expect(text, key).not.toContain(path!);
        expect(i.i18n.exists(key, { lng: i.i18n.language, fallbackLng: [] }), key).toBe(true);
      }
    }
  });
});
