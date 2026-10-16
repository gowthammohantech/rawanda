import { describe, expect, it } from "vitest";

import {
  VALIDATION_KEYS,
  isValidationMessageKey,
  parseValidationMessage,
  vMsg,
} from "./messages.ts";

describe("vMsg / parseValidationMessage", () => {
  it("encodes keys without params as validation:<key>", () => {
    expect(vMsg("required")).toBe("validation:required");
    expect(vMsg("required", {})).toBe("validation:required");
  });

  it("encodes params as JSON after a bar", () => {
    expect(vMsg("reasonTooShort", { min: 10 })).toBe('validation:reasonTooShort|{"min":10}');
  });

  it.each(VALIDATION_KEYS)("round-trips %s with and without params", (key) => {
    expect(parseValidationMessage(vMsg(key))).toEqual({ key, params: {} });
    const params = { min: 1, max: 5, label: "a|b" };
    expect(parseValidationMessage(vMsg(key, params))).toEqual({ key, params });
  });

  it("rejects English text, unknown keys, foreign namespaces and malformed params", () => {
    expect(parseValidationMessage("Required")).toBeNull();
    expect(parseValidationMessage("validation:notAKey")).toBeNull();
    expect(parseValidationMessage("clinical:required")).toBeNull();
    expect(parseValidationMessage("validation:required|{oops")).toBeNull();
    expect(parseValidationMessage("validation:required|[1,2]")).toBeNull();
    expect(parseValidationMessage("validation:required|null")).toBeNull();
  });

  it("has unique keys, all camelCase", () => {
    expect(new Set(VALIDATION_KEYS).size).toBe(VALIDATION_KEYS.length);
    for (const key of VALIDATION_KEYS) expect(key).toMatch(/^[a-z][A-Za-z]*$/u);
    expect(isValidationMessageKey("unitRequired")).toBe(true);
    expect(isValidationMessageKey("nope")).toBe(false);
  });

  it("keeps the FND-03 base keys first, in order (append-only list)", () => {
    expect(VALIDATION_KEYS.slice(0, 17)).toEqual([
      "required",
      "reasonTooShort",
      "numberOutOfRange",
      "integerRequired",
      "unitRequired",
      "contextRequired",
      "dateInFuture",
      "dateTooOld",
      "diastolicNotBelowSystolic",
      "evidenceRequired",
      "evidenceTypeRequired",
      "dueDateBeforeStart",
      "invalidIdentifier",
      "duplicateIdempotencyKey",
      "consentWithdrawn",
      "tooLong",
      "invalidEnum",
    ]);
  });
});
