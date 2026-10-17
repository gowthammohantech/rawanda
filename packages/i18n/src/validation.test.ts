import {
  safeParseToFieldErrors,
  VALIDATION_KEYS,
  Version,
  vMsg,
  type ValidationMessageKey,
} from "@laif/contracts";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { clearMissingKeyReport, getMissingKeyReport, setMissingKeyLogging } from "./missing.ts";
import { createTestI18n } from "./testing.ts";
import {
  fieldErrorText,
  translateParsedValidationMessage,
  translateValidationMessage,
} from "./validation.ts";

const en = createTestI18n("en");
const rw = createTestI18n("rw");

/** Representative params for every key (as emitted by @laif/contracts). */
const SAMPLE_PARAMS: Partial<Record<ValidationMessageKey, Record<string, string | number>>> = {
  reasonTooShort: { min: 10 },
  numberOutOfRange: { min: 60, max: 260 },
  tooShort: { min: 3 },
  minLength: { min: 2 },
  tooLong: { max: 500 },
  dateTooOld: { days: 30 },
  unrecognizedKeys: { keys: "foo,bar" },
  ageRange: { min: 0, max: 120 },
  outOfEntryRange: { min: 1, max: 35, unit: "mmol/L" },
};

beforeEach(() => clearMissingKeyReport());
afterEach(() => setMissingKeyLogging(false));

describe("translateValidationMessage", () => {
  it("renders the RW reasonTooShort string with 10 interpolated", () => {
    const out = translateValidationMessage(rw.t, 'validation:reasonTooShort|{"min":10}');
    expect(out).toBe("Tanga impamvu ifite nibura inyuguti 10.");
    expect(translateValidationMessage(en.t, 'validation:reasonTooShort|{"min":10}')).toBe(
      "Give a reason of at least 10 characters.",
    );
  });

  it.each(["en", "rw"] as const)(
    "renders every VALIDATION_KEYS entry in %s without raw keys or blank interpolation",
    (lng) => {
      const t = (lng === "en" ? en : rw).t;
      const generic = translateValidationMessage(t, vMsg("invalid"));
      for (const key of VALIDATION_KEYS) {
        const out = translateValidationMessage(t, vMsg(key, SAMPLE_PARAMS[key]));
        expect(out, key).not.toMatch(/\{\{|\}\}|validation:/);
        expect(out.trim(), key).not.toBe("");
        expect(out, key).not.toBe(key);
        // Every key has its own copy (only `invalid` renders the generic message).
        if (key !== "invalid") expect(out, key).not.toBe(generic);
      }
    },
  );

  it("HWM-04 ageRange needs {min,max}: rendered with both, generic without", () => {
    expect(translateValidationMessage(en.t, vMsg("ageRange", { min: 0, max: 120 }))).toBe(
      "Age must be between 0 and 120 years.",
    );
    expect(translateValidationMessage(en.t, vMsg("ageRange"))).toBe(
      translateValidationMessage(en.t, vMsg("invalid")),
    );
  });

  it("HWM-05 outOfEntryRange: unit-aware typing-check wording in EN and RW, generic without params", () => {
    const msg = vMsg("outOfEntryRange", { min: 60, max: 260, unit: "mmHg" });
    expect(translateValidationMessage(en.t, msg)).toBe(
      "Outside the expected entry range (60–260 mmHg). Check for typing errors.",
    );
    expect(
      translateValidationMessage(
        rw.t,
        vMsg("outOfEntryRange", { min: 1, max: 35, unit: "mmol/L" }),
      ),
    ).toBe("Kiri hanze y'urugero ruteganyijwe (1–35 mmol/L). Reba niba nta kosa ryo kwandika.");
    // Never diagnostic wording.
    for (const t of [en.t, rw.t]) {
      expect(translateValidationMessage(t, msg)).not.toMatch(/high|low|abnormal|danger/i);
    }
    expect(translateValidationMessage(en.t, vMsg("outOfEntryRange", { min: 60, max: 260 }))).toBe(
      translateValidationMessage(en.t, vMsg("invalid")),
    );
    expect(translateValidationMessage(en.t, vMsg("measuredAtOld"))).toBe(
      "This reading was taken more than 24 hours ago. Check the date.",
    );
  });

  it("renders numberOutOfRange for {min,max}, {min} only, {max} only and no params", () => {
    expect(translateValidationMessage(en.t, vMsg("numberOutOfRange", { min: 60, max: 260 }))).toBe(
      "Enter a value between 60 and 260.",
    );
    expect(translateValidationMessage(en.t, vMsg("numberOutOfRange", { min: 1 }))).toBe(
      "Enter a value of at least 1.",
    );
    expect(translateValidationMessage(en.t, vMsg("numberOutOfRange", { max: 35 }))).toBe(
      "Enter a value of no more than 35.",
    );
    expect(translateValidationMessage(en.t, vMsg("numberOutOfRange", { min: 0, max: 120 }))).toBe(
      "Enter a value between 0 and 120.",
    );
    expect(translateValidationMessage(en.t, vMsg("numberOutOfRange"))).toBe(
      "Enter a value within the allowed range.",
    );
    expect(translateValidationMessage(rw.t, vMsg("numberOutOfRange", { min: 60, max: 260 }))).toBe(
      "Andika umubare uri hagati ya 60 na 260.",
    );
    expect(translateValidationMessage(rw.t, vMsg("numberOutOfRange", { min: 1 }))).toBe(
      "Andika umubare ungana nibura na 1.",
    );
    expect(translateValidationMessage(rw.t, vMsg("numberOutOfRange", { max: 35 }))).toBe(
      "Andika umubare utarenze 35.",
    );
  });

  it("translates real contracts output (Version: numberOutOfRange with only {min})", () => {
    const errors = safeParseToFieldErrors(Version, 0);
    const parsed = Object.values(errors)[0];
    expect(parsed).toEqual({ key: "numberOutOfRange", params: { min: 1 } });
    expect(translateParsedValidationMessage(rw.t, parsed!)).toBe(
      "Andika umubare ungana nibura na 1.",
    );
  });

  it("renders validation:invalid for unknown messages and logs them in dev", () => {
    const warn = vi.fn();
    setMissingKeyLogging(true, warn);
    expect(translateValidationMessage(en.t, "Expected number, received string")).toBe(
      "This value is not valid.",
    );
    expect(translateValidationMessage(rw.t, "validation:notAKey")).toBe("Aka gaciro ntikemewe.");
    expect(translateValidationMessage(en.t, "validation:required|not-json")).toBe(
      "This value is not valid.",
    );
    expect(getMissingKeyReport().map((e) => e.kind)).toEqual([
      "unknownValidationMessage",
      "unknownValidationMessage",
      "unknownValidationMessage",
    ]);
    expect(warn).toHaveBeenCalledTimes(3);
  });

  it("does not log unknown messages when dev logging is off", () => {
    translateValidationMessage(en.t, "nope");
    expect(getMissingKeyReport()).toEqual([]);
  });

  it("never renders a blank interpolation when a required param is missing", () => {
    expect(translateValidationMessage(en.t, vMsg("reasonTooShort"))).toBe(
      "This value is not valid.",
    );
    expect(translateValidationMessage(en.t, vMsg("tooLong"))).toBe("This value is not valid.");
  });

  it("ignores params that would override i18next options", () => {
    const out = translateValidationMessage(
      en.t,
      'validation:reasonTooShort|{"min":10,"lng":"rw","ns":"common"}',
    );
    expect(out).toBe("Give a reason of at least 10 characters.");
  });
});

describe("fieldErrorText", () => {
  it("handles RHF FieldError, parsed messages, raw strings and no error", () => {
    expect(fieldErrorText(en.t, undefined)).toBeUndefined();
    expect(fieldErrorText(en.t, null)).toBeUndefined();
    expect(fieldErrorText(en.t, { message: "" })).toBeUndefined();
    expect(fieldErrorText(en.t, { message: vMsg("required") })).toBe("This field is required.");
    expect(fieldErrorText(rw.t, { key: "unitRequired", params: {} })).toBe(
      "Hitamo igipimo (unit).",
    );
    expect(fieldErrorText(en.t, vMsg("dateTooOld", { days: 30 }))).toBe(
      "The date cannot be more than 30 days ago.",
    );
  });
});
