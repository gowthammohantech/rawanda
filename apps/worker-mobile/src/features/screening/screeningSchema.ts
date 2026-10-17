/**
 * Screening form schema (HWM-05 task 3). Built on the FND-03 contracts: the draft shape is
 * `ScreeningDraftInputSchema` (every field optional — anything may be SAVED, validated by the
 * repository on every `saveScreeningDraft`), the submit shape
 * is `createScreeningInputSchema({ limits, now })` (HWM-06). The form schema below is what gates
 * "Review"; everything it accepts also passes the submit contract (tested).
 *
 * Rules (every message is a `vMsg` i18n key, rendered by `Field` in the active language):
 * - blood pressure: systolic AND diastolic required (the FND-03 submit contract requires the BP
 *   pair, so a glucose-only screening cannot be submitted — see the phase deviation note);
 *   whole numbers; within the DEMO entry range; diastolic below systolic;
 * - glucose (optional): a value needs a unit (never implied) and an explicit reading context
 *   (`fasting | non_fasting | not_recorded`); within the unit's DEMO entry range; `,` or `.`;
 * - `measuredAt`: required, ≤ demo now + 5 min, ≥ demo now − 30 days (FND-03 ★); older than
 *   24 h is a NON-blocking "check the date" prompt (`measuredAtWarning`);
 * - observations ≤ 500 characters.
 *
 * Entry ranges are FND-05 `DEMO_PLAUSIBILITY_LIMITS` (typing checks labelled
 * `DEMO_RULE_NOT_CLINICALLY_VALIDATED`) — never "high" / "abnormal" wording.
 */
import {
  createScreeningInputSchema,
  SCREENING_FUTURE_TOLERANCE_MS,
  SCREENING_MAX_AGE_DAYS,
  SCREENING_NOTES_MAX,
  vMsg,
  type ScreeningDraftInput,
  type ScreeningInput,
} from "@laif/contracts";
import {
  DEMO_RULE_DISCLAIMER,
  GLUCOSE_CONTEXTS,
  GLUCOSE_UNITS,
  type GlucoseContext,
  type GlucoseUnit,
  type NumericRange,
  type PlausibilityLimits,
  type Screening,
} from "@laif/domain";
import { DEMO_PLAUSIBILITY_LIMITS } from "@laif/mock-data";
import { z } from "zod";

export type ScreeningFormValues = {
  /** Raw text as typed (whole number). */
  systolic: string;
  diastolic: string;
  /** Raw text as typed (`,` or `.` decimal, one decimal place). */
  glucoseValue: string;
  /** No default: must be chosen. */
  glucoseUnit: GlucoseUnit | null;
  /** No default: must be chosen (`not_recorded` is an explicit choice). */
  glucoseContext: GlucoseContext | null;
  /** UTC ISO (Kigali wall time in the field), null while incomplete. */
  measuredAt: string | null;
  notes: string;
};

export type ScreeningFormField = keyof ScreeningFormValues;

/** Form order (error summary, focus order). */
export const SCREENING_FORM_FIELDS = [
  "systolic",
  "diastolic",
  "glucoseValue",
  "glucoseUnit",
  "glucoseContext",
  "measuredAt",
  "notes",
] as const satisfies readonly ScreeningFormField[];

/** Reading fields counted for the drafts list ("3 of 5 fields"). */
export const COMPLETENESS_FIELDS = [
  "systolic",
  "diastolic",
  "glucoseValue",
  "glucoseUnit",
  "glucoseContext",
] as const satisfies readonly (keyof Screening)[];

/** `source` of a worker-entered screening (stored as FND-02 `worker_mobile`). */
export const SCREENING_SOURCE = "worker_device_manual_entry" as const;

export const MMHG = "mmHg" as const;
const DAY_MS = 86_400_000;
const WARN_AFTER_MS = DAY_MS;

export type EntryRange = NumericRange & {
  unit: GlucoseUnit | typeof MMHG;
  label: typeof DEMO_RULE_DISCLAIMER;
};

/** The DEMO entry ranges, each labelled `DEMO_RULE_NOT_CLINICALLY_VALIDATED`. */
export function entryRanges(limits: PlausibilityLimits = DEMO_PLAUSIBILITY_LIMITS) {
  const range = (r: NumericRange, unit: EntryRange["unit"]): EntryRange => ({
    min: r.min,
    max: r.max,
    unit,
    label: DEMO_RULE_DISCLAIMER,
  });
  return {
    systolic: range(limits.systolic, MMHG),
    diastolic: range(limits.diastolic, MMHG),
    glucoseMmol: range(limits.glucoseMmol, "mmol/L"),
    glucoseMgDl: range(limits.glucoseMgDl, "mg/dL"),
  } as const;
}

export const SCREENING_ENTRY_RANGES = entryRanges();

// ── Parsing ──────────────────────────────────────────────────────────────────

const INTEGER = /^\d+$/u;
const DECIMAL = /^\d+(?:[.,]\d+)?$/u;

/** "120" → 120; empty / not a whole number → null. */
export function parseWholeNumber(raw: string): number | null {
  const text = raw.trim();
  return INTEGER.test(text) ? Number(text) : null;
}

/** "7,8" / "7.8" / "7." → 7.8 / 7.8 / 7; empty / invalid → null. */
export function parseGlucose(raw: string): number | null {
  const text = raw.trim().replace(/[.,]$/u, "");
  return DECIMAL.test(text) ? Number(text.replace(",", ".")) : null;
}

/** Glucose typing: digits + one `,`/`.` separator, at most one decimal place. */
export function sanitiseGlucoseInput(raw: string): string {
  let out = "";
  let separator = -1;
  for (const ch of raw) {
    if (ch >= "0" && ch <= "9") {
      if (separator >= 0 && out.length - separator > 1) continue;
      out += ch;
    } else if ((ch === "," || ch === ".") && separator < 0 && out !== "") {
      separator = out.length;
      out += ch;
    }
  }
  return out;
}

export function rangeFor(
  field: "systolic" | "diastolic" | "glucose",
  unit: GlucoseUnit | null,
  limits: PlausibilityLimits = DEMO_PLAUSIBILITY_LIMITS,
): EntryRange {
  const ranges = entryRanges(limits);
  if (field !== "glucose") return ranges[field];
  return unit === "mg/dL" ? ranges.glucoseMgDl : ranges.glucoseMmol;
}

const outOfRange = (range: EntryRange) =>
  vMsg("outOfEntryRange", { min: range.min, max: range.max, unit: range.unit });

// ── Form schema ──────────────────────────────────────────────────────────────

export type ScreeningFormSchemaDeps = {
  /** Demo clock instant getter (never the device clock). */
  now: () => Date;
  limits?: PlausibilityLimits;
};

export function createScreeningFormSchema({
  now,
  limits = DEMO_PLAUSIBILITY_LIMITS,
}: ScreeningFormSchemaDeps) {
  const ranges = entryRanges(limits);
  return z
    .object({
      systolic: z.string(),
      diastolic: z.string(),
      glucoseValue: z.string(),
      glucoseUnit: z.enum(GLUCOSE_UNITS).nullable(),
      glucoseContext: z.enum(GLUCOSE_CONTEXTS).nullable(),
      measuredAt: z.string().nullable(),
      notes: z.string(),
    })
    .superRefine((v, ctx) => {
      const add = (field: ScreeningFormField, message: string) =>
        ctx.addIssue({ code: "custom", path: [field], message });

      const bp = (field: "systolic" | "diastolic"): number | null => {
        const text = v[field].trim();
        if (text === "") {
          add(field, vMsg("required"));
          return null;
        }
        const value = parseWholeNumber(text);
        if (value === null) {
          add(field, vMsg("integerRequired"));
          return null;
        }
        const range = ranges[field];
        if (value < range.min || value > range.max) {
          add(field, outOfRange(range));
          return null;
        }
        return value;
      };
      const systolic = bp("systolic");
      const diastolic = bp("diastolic");
      if (systolic !== null && diastolic !== null && diastolic >= systolic) {
        add("diastolic", vMsg("diastolicNotBelowSystolic"));
      }

      const glucoseText = v.glucoseValue.trim();
      if (glucoseText !== "") {
        const glucose = parseGlucose(glucoseText);
        if (glucose === null) {
          add("glucoseValue", vMsg("invalidFormat"));
        } else if (v.glucoseUnit !== null) {
          const range = v.glucoseUnit === "mg/dL" ? ranges.glucoseMgDl : ranges.glucoseMmol;
          if (glucose < range.min || glucose > range.max) add("glucoseValue", outOfRange(range));
        }
        if (v.glucoseUnit === null) add("glucoseUnit", vMsg("unitRequired"));
        if (v.glucoseContext === null) add("glucoseContext", vMsg("contextRequired"));
      }

      if (v.measuredAt === null || v.measuredAt === "") {
        add("measuredAt", vMsg("required"));
      } else {
        const at = Date.parse(v.measuredAt);
        const nowMs = now().getTime();
        if (Number.isNaN(at)) add("measuredAt", vMsg("invalidDate"));
        else if (at > nowMs + SCREENING_FUTURE_TOLERANCE_MS)
          add("measuredAt", vMsg("dateInFuture"));
        else if (at < nowMs - SCREENING_MAX_AGE_DAYS * DAY_MS) {
          add("measuredAt", vMsg("dateTooOld", { days: SCREENING_MAX_AGE_DAYS }));
        }
      }

      if (v.notes.trim().length > SCREENING_NOTES_MAX) {
        add("notes", vMsg("tooLong", { max: SCREENING_NOTES_MAX }));
      }
    });
}

export type ScreeningFormSchema = ReturnType<typeof createScreeningFormSchema>;

/** Non-blocking prompt: a valid `measuredAt` more than 24 h before demo now. */
export function measuredAtWarning(measuredAt: string | null, now: Date): string | null {
  if (measuredAt === null) return null;
  const at = Date.parse(measuredAt);
  if (Number.isNaN(at)) return null;
  const age = now.getTime() - at;
  return age > WARN_AFTER_MS && age <= SCREENING_MAX_AGE_DAYS * DAY_MS
    ? vMsg("measuredAtOld")
    : null;
}

// ── Draft ⇄ form ─────────────────────────────────────────────────────────────

/** A stored draft → form values (units / context stay unselected when never chosen). */
export function draftToFormValues(draft: Screening): ScreeningFormValues {
  return {
    systolic: draft.systolic === null ? "" : String(draft.systolic),
    diastolic: draft.diastolic === null ? "" : String(draft.diastolic),
    glucoseValue: draft.glucoseValue === null ? "" : String(draft.glucoseValue),
    glucoseUnit: draft.glucoseUnit,
    glucoseContext: draft.glucoseContext,
    measuredAt: draft.measuredAt,
    notes: draft.notes,
  };
}

/** Form values → the draft patch saved on the device (no validation needed to save). */
export function formValuesToDraftPatch(
  values: ScreeningFormValues,
): Omit<ScreeningDraftInput, "idempotencyKey" | "patientId" | "screeningId"> {
  return {
    ...(values.measuredAt === null ? {} : { measuredAt: values.measuredAt }),
    systolic: parseWholeNumber(values.systolic),
    diastolic: parseWholeNumber(values.diastolic),
    glucoseValue: parseGlucose(values.glucoseValue),
    glucoseUnit: values.glucoseUnit,
    glucoseContext: values.glucoseContext,
    notes: values.notes.slice(0, SCREENING_NOTES_MAX),
  };
}

/** Same payload as the last save? (autosave skips identical writes). */
export function draftSignature(values: ScreeningFormValues): string {
  return JSON.stringify(formValuesToDraftPatch(values));
}

/** How many of the 5 reading fields a draft has ("3 of 5 fields"). */
export function draftCompleteness(draft: Pick<Screening, (typeof COMPLETENESS_FIELDS)[number]>): {
  count: number;
  total: number;
} {
  const count = COMPLETENESS_FIELDS.filter((field) => draft[field] !== null).length;
  return { count, total: COMPLETENESS_FIELDS.length };
}

/**
 * Valid form values → the FND-03 submit input (HWM-06), re-validated by the contract with the
 * same limits and demo clock.
 */
export function toScreeningInput(
  values: ScreeningFormValues,
  options: {
    patientId: string;
    idempotencyKey: string;
    now: () => Date;
    limits?: PlausibilityLimits;
  },
): ScreeningInput {
  const glucose = parseGlucose(values.glucoseValue);
  return createScreeningInputSchema({
    limits: options.limits ?? DEMO_PLAUSIBILITY_LIMITS,
    now: options.now,
  }).parse({
    idempotencyKey: options.idempotencyKey,
    patientId: options.patientId,
    measuredAt: values.measuredAt,
    systolic: parseWholeNumber(values.systolic),
    diastolic: parseWholeNumber(values.diastolic),
    glucoseValue: glucose,
    glucoseUnit: glucose === null ? null : values.glucoseUnit,
    glucoseContext: glucose === null ? null : values.glucoseContext,
    notes: values.notes,
  });
}
