/**
 * Amendment form schema (HWM-06 task 8). One field per correction, the new value validated with
 * the SAME refinements as the screening form (`screeningSchema.ts`: whole-number BP within the
 * DEMO entry range and diastolic below systolic against the other effective value; glucose in
 * the effective unit's range; unit / context explicit choices; measured-at within the demo-clock
 * window) and a REQUIRED reason (≥ 10 non-whitespace characters, FND-02 `hasMinimumReason`).
 * A value equal to the current effective value is refused (`noChanges`). The output is the
 * FND-03 `ScreeningAmendmentInput` shape (`field` + `after` + `reason`).
 */
import { SCREENING_FUTURE_TOLERANCE_MS, SCREENING_MAX_AGE_DAYS, vMsg } from "@laif/contracts";
import {
  AMENDABLE_SCREENING_FIELDS,
  GLUCOSE_CONTEXTS,
  GLUCOSE_UNITS,
  hasMinimumReason,
  MIN_REASON_NON_WHITESPACE_CHARS,
  type AmendableScreeningField,
  type AmendableValue,
  type EffectiveReadings,
  type GlucoseContext,
  type GlucoseUnit,
  type PlausibilityLimits,
} from "@laif/domain";
import { DEMO_PLAUSIBILITY_LIMITS } from "@laif/mock-data";
import { z } from "zod";

import type { AmendCall } from "../../data/screenings.ts";
import { entryRanges, parseGlucose, parseWholeNumber } from "./screeningSchema.ts";

export type AmendFormValues = {
  field: AmendableScreeningField | null;
  /** Raw text (systolic, diastolic, glucose value). */
  value: string;
  unit: GlucoseUnit | null;
  context: GlucoseContext | null;
  /** UTC ISO (Kigali wall time in the field). */
  measuredAt: string | null;
  reason: string;
};

export type AmendFormField = keyof AmendFormValues;

/** Order of the error summary / focus. */
export const AMEND_FORM_FIELDS = [
  "field",
  "value",
  "unit",
  "context",
  "measuredAt",
  "reason",
] as const satisfies readonly AmendFormField[];

/** Which form control carries the new value of each amendable field. */
export const VALUE_CONTROL: Record<AmendableScreeningField, AmendFormField> = {
  systolic: "value",
  diastolic: "value",
  glucoseValue: "value",
  glucoseUnit: "unit",
  glucoseContext: "context",
  measuredAt: "measuredAt",
};

export const EMPTY_AMEND_VALUES: AmendFormValues = {
  field: null,
  value: "",
  unit: null,
  context: null,
  measuredAt: null,
  reason: "",
};

/** Pre-fills the value controls with the current effective value of `field`. */
export function amendValuesFor(
  field: AmendableScreeningField,
  current: EffectiveReadings,
  reason: string,
): AmendFormValues {
  const raw = current[field];
  return {
    ...EMPTY_AMEND_VALUES,
    field,
    reason,
    value:
      field === "systolic" || field === "diastolic" || field === "glucoseValue"
        ? raw === null
          ? ""
          : String(raw)
        : "",
    unit: field === "glucoseUnit" ? current.glucoseUnit : null,
    context: field === "glucoseContext" ? current.glucoseContext : null,
    measuredAt: field === "measuredAt" ? current.measuredAt : null,
  };
}

const DAY_MS = 86_400_000;

export type AmendSchemaDeps = {
  now: () => Date;
  current: EffectiveReadings;
  limits?: PlausibilityLimits;
};

export function createAmendSchema({
  now,
  current,
  limits = DEMO_PLAUSIBILITY_LIMITS,
}: AmendSchemaDeps) {
  const ranges = entryRanges(limits);
  return z
    .object({
      field: z.enum(AMENDABLE_SCREENING_FIELDS).nullable(),
      value: z.string(),
      unit: z.enum(GLUCOSE_UNITS).nullable(),
      context: z.enum(GLUCOSE_CONTEXTS).nullable(),
      measuredAt: z.string().nullable(),
      reason: z.string(),
    })
    .superRefine((v, ctx) => {
      const add = (path: AmendFormField, message: string) =>
        ctx.addIssue({ code: "custom", path: [path], message });

      if (!hasMinimumReason(v.reason)) {
        add("reason", vMsg("reasonTooShort", { min: MIN_REASON_NON_WHITESPACE_CHARS }));
      }
      if (v.field === null) {
        add("field", vMsg("required"));
        return;
      }
      const after = afterOf({ ...v, field: v.field });
      switch (v.field) {
        case "systolic":
        case "diastolic": {
          const text = v.value.trim();
          if (text === "") return add("value", vMsg("required"));
          const n = parseWholeNumber(text);
          if (n === null) return add("value", vMsg("integerRequired"));
          const range = ranges[v.field];
          if (n < range.min || n > range.max) {
            return add(
              "value",
              vMsg("outOfEntryRange", { min: range.min, max: range.max, unit: range.unit }),
            );
          }
          const systolic = v.field === "systolic" ? n : current.systolic;
          const diastolic = v.field === "diastolic" ? n : current.diastolic;
          if (systolic !== null && diastolic !== null && diastolic >= systolic) {
            return add("value", vMsg("diastolicNotBelowSystolic"));
          }
          break;
        }
        case "glucoseValue": {
          const text = v.value.trim();
          if (text === "") return add("value", vMsg("required"));
          const g = parseGlucose(text);
          if (g === null) return add("value", vMsg("invalidFormat"));
          if (current.glucoseUnit === null) return add("value", vMsg("unitRequired"));
          const range = current.glucoseUnit === "mg/dL" ? ranges.glucoseMgDl : ranges.glucoseMmol;
          if (g < range.min || g > range.max) {
            return add(
              "value",
              vMsg("outOfEntryRange", { min: range.min, max: range.max, unit: range.unit }),
            );
          }
          break;
        }
        case "glucoseUnit":
          if (v.unit === null) return add("unit", vMsg("unitRequired"));
          break;
        case "glucoseContext":
          if (v.context === null) return add("context", vMsg("contextRequired"));
          break;
        case "measuredAt": {
          if (v.measuredAt === null || v.measuredAt === "") {
            return add("measuredAt", vMsg("required"));
          }
          const at = Date.parse(v.measuredAt);
          const nowMs = now().getTime();
          if (Number.isNaN(at)) return add("measuredAt", vMsg("invalidDate"));
          if (at > nowMs + SCREENING_FUTURE_TOLERANCE_MS) {
            return add("measuredAt", vMsg("dateInFuture"));
          }
          if (at < nowMs - SCREENING_MAX_AGE_DAYS * DAY_MS) {
            return add("measuredAt", vMsg("dateTooOld", { days: SCREENING_MAX_AGE_DAYS }));
          }
          break;
        }
      }
      if (isSame(v.field, after, current[v.field])) add(VALUE_CONTROL[v.field], vMsg("noChanges"));
    });
}

function isSame(field: AmendableScreeningField, after: AmendableValue, before: AmendableValue) {
  if (field === "measuredAt" && typeof after === "string" && typeof before === "string") {
    return Date.parse(after) === Date.parse(before);
  }
  return after === before;
}

/** The `after` value carried by the form for its field. */
function afterOf(v: Omit<AmendFormValues, "field"> & { field: AmendableScreeningField }) {
  switch (v.field) {
    case "systolic":
    case "diastolic":
      return parseWholeNumber(v.value);
    case "glucoseValue":
      return parseGlucose(v.value);
    case "glucoseUnit":
      return v.unit;
    case "glucoseContext":
      return v.context;
    case "measuredAt":
      return v.measuredAt;
  }
}

/** Valid form values → the amendment call (reason trimmed). */
export function toAmendCall(values: AmendFormValues): AmendCall {
  if (values.field === null) throw new Error("toAmendCall: no field");
  return {
    field: values.field,
    after: afterOf({ ...values, field: values.field }),
    reason: values.reason.trim(),
  };
}

export type AmendIssue = { field: AmendFormField; message: string };

/** First issue per control, in form order. */
export function amendIssues(issues: readonly z.core.$ZodIssue[]): AmendIssue[] {
  const byField = new Map<AmendFormField, string>();
  for (const issue of issues) {
    const field = issue.path[0] as AmendFormField;
    if (!byField.has(field)) byField.set(field, issue.message);
  }
  return AMEND_FORM_FIELDS.flatMap((field) => {
    const message = byField.get(field);
    return message === undefined ? [] : [{ field, message }];
  });
}
