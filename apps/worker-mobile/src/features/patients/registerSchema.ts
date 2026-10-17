/**
 * Registration form schema (HWM-04 task 5). Wraps the FND-03 `RegisterPatientInputSchema`
 * (`@laif/contracts`) with the worker form's stricter rules; every message is a `vMsg` i18n key
 * (rendered by `Field` in the active language, so a language switch re-translates visible errors
 * without touching the typed values).
 *
 * - given / family name: required, 1–60 characters, letters / space / hyphen / apostrophe only;
 * - date of birth (`YYYY-MM-DD`): valid, not after today (Africa/Kigali), age ≤ 120 — OR an
 *   estimated age: whole number 0–120 (saved with the "estimated" flag = `estimatedAgeYears`);
 * - sex: female / male / not recorded (an explicit choice is required);
 * - village / cell: optional, ≤ 60; phone: optional, synthetic `07X XXX XXXX`.
 *
 * `pilotAgeWarning()` is the NON-blocking pilot-scope prompt (derived age < 18): a data-entry
 * check, not an eligibility decision (PO decision in CONSISTENCY_REVIEW).
 */
import {
  ESTIMATED_AGE_MAX_YEARS,
  RegisterPatientInputSchema,
  SYNTHETIC_PHONE_PATTERN,
  VILLAGE_LABEL_MAX,
  vMsg,
  type RegisterPatientInput,
} from "@laif/contracts";
import { patientAgeYears, zonedDay, type FacilityId, type Sex } from "@laif/domain";
import { z } from "zod";

export const NAME_MAX = 60;
export const PILOT_MIN_AGE = 18;
const NAME_PATTERN = /^[\p{L}][\p{L}\p{M}' ’-]*$/u;
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/u;

export const BIRTH_MODES = ["dob", "estimated"] as const;
export type BirthMode = (typeof BIRTH_MODES)[number];

export type RegisterFormValues = {
  givenName: string;
  familyName: string;
  birthMode: BirthMode;
  dateOfBirth: string;
  estimatedAge: string;
  sex: Sex | null;
  villageLabel: string;
  phone: string;
};

export const REGISTER_FORM_FIELDS = [
  "givenName",
  "familyName",
  "birthMode",
  "dateOfBirth",
  "estimatedAge",
  "sex",
  "villageLabel",
  "phone",
] as const satisfies readonly (keyof RegisterFormValues)[];

export function emptyRegisterForm(initialName = ""): RegisterFormValues {
  const [given = "", ...family] = initialName.trim().split(/\s+/u);
  return {
    givenName: given,
    familyName: family.join(" "),
    birthMode: "dob",
    dateOfBirth: "",
    estimatedAge: "",
    sex: null,
    villageLabel: "",
    phone: "",
  };
}

const AGE_RANGE = { min: 0, max: ESTIMATED_AGE_MAX_YEARS };

/** Digits only (`078 000 0001` → `0780000001`). */
export const phoneDigits = (value: string) => value.replace(/\D/gu, "");

/** Masked display `07X XXX XXXX` of up to 10 typed digits. */
export function formatPhoneInput(value: string): string {
  const digits = phoneDigits(value).slice(0, 10);
  return [digits.slice(0, 3), digits.slice(3, 6), digits.slice(6)]
    .filter((part) => part !== "")
    .join(" ");
}

function isRealDate(value: string): boolean {
  if (!DATE_PATTERN.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}

const nameField = z
  .string()
  .trim()
  .min(1, { error: vMsg("required") })
  .max(NAME_MAX, { error: vMsg("tooLong", { max: NAME_MAX }) })
  .regex(NAME_PATTERN, { error: vMsg("namePattern") });

/** `now` = the repository's demo clock (never the device clock). */
export function createRegisterFormSchema(now: Date) {
  const today = zonedDay(now).date;
  return z
    .object({
      givenName: nameField,
      familyName: nameField,
      birthMode: z.enum(BIRTH_MODES),
      dateOfBirth: z.string().trim(),
      estimatedAge: z.string().trim(),
      sex: z.enum(["female", "male", "not_recorded"]).nullable(),
      villageLabel: z
        .string()
        .trim()
        .max(VILLAGE_LABEL_MAX, { error: vMsg("tooLong", { max: VILLAGE_LABEL_MAX }) }),
      phone: z.string().trim(),
    })
    .superRefine((v, ctx) => {
      if (v.birthMode === "dob") {
        if (v.dateOfBirth === "") {
          ctx.addIssue({ code: "custom", path: ["dateOfBirth"], message: vMsg("required") });
        } else if (!isRealDate(v.dateOfBirth)) {
          ctx.addIssue({ code: "custom", path: ["dateOfBirth"], message: vMsg("invalidDate") });
        } else if (v.dateOfBirth > today) {
          ctx.addIssue({ code: "custom", path: ["dateOfBirth"], message: vMsg("dateInFuture") });
        } else if ((patientAgeYears({ dateOfBirth: v.dateOfBirth }, now) ?? 0) > AGE_RANGE.max) {
          ctx.addIssue({
            code: "custom",
            path: ["dateOfBirth"],
            message: vMsg("ageRange", AGE_RANGE),
          });
        }
      } else if (v.estimatedAge === "") {
        ctx.addIssue({ code: "custom", path: ["estimatedAge"], message: vMsg("required") });
      } else if (!/^\d+$/u.test(v.estimatedAge)) {
        ctx.addIssue({ code: "custom", path: ["estimatedAge"], message: vMsg("integerRequired") });
      } else if (Number(v.estimatedAge) > AGE_RANGE.max) {
        ctx.addIssue({
          code: "custom",
          path: ["estimatedAge"],
          message: vMsg("ageRange", AGE_RANGE),
        });
      }
      if (v.sex === null) {
        ctx.addIssue({ code: "custom", path: ["sex"], message: vMsg("required") });
      }
      if (v.phone !== "" && !SYNTHETIC_PHONE_PATTERN.test(phoneDigits(v.phone))) {
        ctx.addIssue({ code: "custom", path: ["phone"], message: vMsg("phonePattern") });
      }
    });
}

/** Derived age in whole years at the demo date, or null while the birth input is incomplete. */
export function derivedAge(values: RegisterFormValues, now: Date): number | null {
  if (values.birthMode === "estimated") {
    return /^\d+$/u.test(values.estimatedAge.trim()) ? Number(values.estimatedAge.trim()) : null;
  }
  const dob = values.dateOfBirth.trim();
  return isRealDate(dob) ? patientAgeYears({ dateOfBirth: dob }, now) : null;
}

/** Non-blocking pilot-scope prompt key, or null. */
export function pilotAgeWarning(values: RegisterFormValues, now: Date): string | null {
  const age = derivedAge(values, now);
  return age !== null && age >= 0 && age < PILOT_MIN_AGE ? vMsg("underPilotAge") : null;
}

/** Valid form values → the FND-03 registration input (re-validated by the contract). */
export function toRegisterInput(
  values: RegisterFormValues,
  options: {
    facilityId: FacilityId;
    idempotencyKey: string;
    matchDecision?: "register_anyway_flagged";
  },
): RegisterPatientInput {
  const village = values.villageLabel.trim();
  const phone = phoneDigits(values.phone);
  return RegisterPatientInputSchema.parse({
    idempotencyKey: options.idempotencyKey,
    givenName: values.givenName.trim(),
    familyName: values.familyName.trim(),
    ...(values.birthMode === "dob"
      ? { dateOfBirth: values.dateOfBirth.trim() }
      : { estimatedAgeYears: Number(values.estimatedAge.trim()) }),
    sex: values.sex ?? "not_recorded",
    facilityId: options.facilityId,
    ...(village === "" ? {} : { villageLabel: village }),
    ...(phone === "" ? {} : { syntheticPhone: phone }),
    ...(options.matchDecision === undefined ? {} : { matchDecision: options.matchDecision }),
  });
}
