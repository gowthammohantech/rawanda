/**
 * HWM-05 screening form schema: every rule, both glucose units, comma decimals, clock-drift
 * tolerance, the non-blocking 24 h prompt, DEMO entry ranges (= FND-05
 * `DEMO_PLAUSIBILITY_LIMITS`, labelled `DEMO_RULE_NOT_CLINICALLY_VALIDATED`) and parity with
 * the FND-03 submit contract.
 */
import { createScreeningInputSchema, vMsg } from "@laif/contracts";
import { DEMO_CLOCK_DEFAULT_ISO, DEMO_RULE_DISCLAIMER, type Screening } from "@laif/domain";
import { DEMO_PLAUSIBILITY_LIMITS } from "@laif/mock-data";
import { describe, expect, it } from "vitest";

import { mapZodIssues } from "../mapZodIssues.ts";
import {
  createScreeningFormSchema,
  draftCompleteness,
  draftSignature,
  draftToFormValues,
  entryRanges,
  formValuesToDraftPatch,
  measuredAtWarning,
  parseGlucose,
  sanitiseGlucoseInput,
  SCREENING_ENTRY_RANGES,
  toScreeningInput,
  type ScreeningFormValues,
} from "../screeningSchema.ts";

const NOW = new Date(DEMO_CLOCK_DEFAULT_ISO);
const now = () => NOW;
const schema = createScreeningFormSchema({ now });
const MIN = 60_000;
const iso = (offsetMs: number) => new Date(NOW.getTime() + offsetMs).toISOString();

const valid: ScreeningFormValues = {
  systolic: "128",
  diastolic: "82",
  glucoseValue: "",
  glucoseUnit: null,
  glucoseContext: null,
  measuredAt: DEMO_CLOCK_DEFAULT_ISO,
  notes: "",
};

const issues = (patch: Partial<ScreeningFormValues>) => {
  const result = schema.safeParse({ ...valid, ...patch });
  return result.success ? [] : mapZodIssues(result.error.issues);
};
const errorOf = (patch: Partial<ScreeningFormValues>, field: keyof ScreeningFormValues) =>
  issues(patch).find((i) => i.field === field);

describe("screening entry ranges (FND-05)", () => {
  it("come from DEMO_PLAUSIBILITY_LIMITS, each labelled DEMO_RULE_NOT_CLINICALLY_VALIDATED", () => {
    expect(SCREENING_ENTRY_RANGES).toEqual({
      systolic: { ...DEMO_PLAUSIBILITY_LIMITS.systolic, unit: "mmHg", label: DEMO_RULE_DISCLAIMER },
      diastolic: {
        ...DEMO_PLAUSIBILITY_LIMITS.diastolic,
        unit: "mmHg",
        label: DEMO_RULE_DISCLAIMER,
      },
      glucoseMmol: {
        ...DEMO_PLAUSIBILITY_LIMITS.glucoseMmol,
        unit: "mmol/L",
        label: DEMO_RULE_DISCLAIMER,
      },
      glucoseMgDl: {
        ...DEMO_PLAUSIBILITY_LIMITS.glucoseMgDl,
        unit: "mg/dL",
        label: DEMO_RULE_DISCLAIMER,
      },
    });
    expect(DEMO_RULE_DISCLAIMER).toBe("DEMO_RULE_NOT_CLINICALLY_VALIDATED");
    expect(SCREENING_ENTRY_RANGES.systolic).toMatchObject({ min: 60, max: 260 });
    expect(SCREENING_ENTRY_RANGES.diastolic).toMatchObject({ min: 30, max: 160 });
    expect(SCREENING_ENTRY_RANGES.glucoseMmol).toMatchObject({ min: 1, max: 35 });
    expect(SCREENING_ENTRY_RANGES.glucoseMgDl).toMatchObject({ min: 18, max: 630 });
  });

  it("follow injected limits (no hard-coded numbers in the form)", () => {
    const limits = { ...DEMO_PLAUSIBILITY_LIMITS, systolic: { min: 90, max: 100 } };
    const custom = createScreeningFormSchema({ now, limits });
    expect(custom.safeParse({ ...valid, systolic: "128" }).success).toBe(false);
    expect(entryRanges(limits).systolic).toMatchObject({ min: 90, max: 100 });
  });
});

describe("createScreeningFormSchema (HWM-05)", () => {
  it("accepts a complete BP-only screening and a BP + glucose screening", () => {
    expect(issues({})).toEqual([]);
    expect(
      issues({ glucoseValue: "7.8", glucoseUnit: "mmol/L", glucoseContext: "non_fasting" }),
    ).toEqual([]);
  });

  it("blood pressure: both values required, whole numbers", () => {
    expect(errorOf({ systolic: "" }, "systolic")?.key).toBe("required");
    expect(errorOf({ diastolic: "" }, "diastolic")?.key).toBe("required");
    expect(errorOf({ systolic: "12a" }, "systolic")?.key).toBe("integerRequired");
    expect(errorOf({ diastolic: "80.5" }, "diastolic")?.key).toBe("integerRequired");
  });

  it("blood pressure: outside the DEMO entry range → typing-check wording with unit", () => {
    expect(errorOf({ systolic: "59" }, "systolic")).toEqual({
      field: "systolic",
      key: "outOfEntryRange",
      params: { min: 60, max: 260, unit: "mmHg" },
    });
    expect(errorOf({ systolic: "261" }, "systolic")?.key).toBe("outOfEntryRange");
    expect(errorOf({ systolic: "60", diastolic: "30" }, "systolic")).toBeUndefined();
    expect(errorOf({ systolic: "260", diastolic: "160" }, "diastolic")).toBeUndefined();
    expect(errorOf({ diastolic: "29" }, "diastolic")?.params).toEqual({
      min: 30,
      max: 160,
      unit: "mmHg",
    });
    expect(errorOf({ systolic: "200", diastolic: "161" }, "diastolic")?.key).toBe(
      "outOfEntryRange",
    );
  });

  it("systolic must be higher than diastolic (equal or lower → error on diastolic)", () => {
    expect(errorOf({ systolic: "90", diastolic: "90" }, "diastolic")?.key).toBe(
      "diastolicNotBelowSystolic",
    );
    expect(errorOf({ systolic: "80", diastolic: "90" }, "diastolic")?.key).toBe(
      "diastolicNotBelowSystolic",
    );
    expect(errorOf({ systolic: "91", diastolic: "90" }, "diastolic")).toBeUndefined();
  });

  it("glucose value without unit or context → unitRequired + contextRequired (T-03)", () => {
    const found = issues({ glucoseValue: "7.8" });
    expect(found.map((i) => [i.field, i.key])).toEqual([
      ["glucoseUnit", "unitRequired"],
      ["glucoseContext", "contextRequired"],
    ]);
    expect(errorOf({ glucoseValue: "7.8", glucoseUnit: "mmol/L" }, "glucoseContext")?.key).toBe(
      "contextRequired",
    );
  });

  it("'Not recorded' is an explicit, accepted context; unit/context ignored without a value", () => {
    expect(
      issues({ glucoseValue: "5.1", glucoseUnit: "mmol/L", glucoseContext: "not_recorded" }),
    ).toEqual([]);
    expect(issues({ glucoseUnit: "mg/dL", glucoseContext: "fasting" })).toEqual([]);
  });

  it("glucose ranges are unit-specific (mmol/L 1.0–35.0, mg/dL 18–630)", () => {
    const g = (value: string, unit: "mmol/L" | "mg/dL") =>
      errorOf(
        { glucoseValue: value, glucoseUnit: unit, glucoseContext: "fasting" },
        "glucoseValue",
      );
    expect(g("1.0", "mmol/L")).toBeUndefined();
    expect(g("35", "mmol/L")).toBeUndefined();
    expect(g("0.9", "mmol/L")?.params).toEqual({ min: 1, max: 35, unit: "mmol/L" });
    expect(g("35.1", "mmol/L")?.key).toBe("outOfEntryRange");
    expect(g("140", "mmol/L")?.key).toBe("outOfEntryRange");
    expect(g("140", "mg/dL")).toBeUndefined();
    expect(g("18", "mg/dL")).toBeUndefined();
    expect(g("17", "mg/dL")?.params).toEqual({ min: 18, max: 630, unit: "mg/dL" });
    expect(g("631", "mg/dL")?.key).toBe("outOfEntryRange");
  });

  it("accepts comma and dot decimal separators", () => {
    expect(parseGlucose("7,8")).toBe(7.8);
    expect(parseGlucose("7.8")).toBe(7.8);
    expect(parseGlucose("7.")).toBe(7);
    expect(parseGlucose("")).toBeNull();
    expect(parseGlucose("abc")).toBeNull();
    expect(
      issues({ glucoseValue: "7,8", glucoseUnit: "mmol/L", glucoseContext: "fasting" }),
    ).toEqual([]);
    expect(sanitiseGlucoseInput("7,85")).toBe("7,8");
    expect(sanitiseGlucoseInput("12.3.4")).toBe("12.3");
    expect(sanitiseGlucoseInput("a1b2")).toBe("12");
    expect(sanitiseGlucoseInput(".5")).toBe("5");
  });

  it("measuredAt: required; ≤ now + 5 min (clock drift); ≥ now − 30 days", () => {
    expect(errorOf({ measuredAt: null }, "measuredAt")?.key).toBe("required");
    expect(errorOf({ measuredAt: "not a date" }, "measuredAt")?.key).toBe("invalidDate");
    expect(errorOf({ measuredAt: iso(5 * MIN) }, "measuredAt")).toBeUndefined();
    expect(errorOf({ measuredAt: iso(5 * MIN + 1000) }, "measuredAt")?.key).toBe("dateInFuture");
    expect(errorOf({ measuredAt: iso(-30 * 1440 * MIN) }, "measuredAt")).toBeUndefined();
    expect(errorOf({ measuredAt: iso(-30 * 1440 * MIN - 1000) }, "measuredAt")).toEqual({
      field: "measuredAt",
      key: "dateTooOld",
      params: { days: 30 },
    });
  });

  it("older than 24 h → NON-blocking 'check the date' prompt", () => {
    expect(measuredAtWarning(iso(-24 * 60 * MIN), NOW)).toBeNull();
    expect(measuredAtWarning(iso(-24 * 60 * MIN - 1000), NOW)).toBe(vMsg("measuredAtOld"));
    expect(issues({ measuredAt: iso(-2 * 1440 * MIN) })).toEqual([]);
    expect(measuredAtWarning(null, NOW)).toBeNull();
  });

  it("observations ≤ 500 characters", () => {
    expect(errorOf({ notes: "x".repeat(500) }, "notes")).toBeUndefined();
    expect(errorOf({ notes: "x".repeat(501) }, "notes")).toEqual({
      field: "notes",
      key: "tooLong",
      params: { max: 500 },
    });
  });

  it("messages are i18n keys, never English text, and never diagnostic", () => {
    const result = schema.safeParse({
      ...valid,
      systolic: "300",
      diastolic: "",
      glucoseValue: "40",
      glucoseUnit: "mmol/L",
      measuredAt: iso(60 * MIN),
    });
    expect(result.success).toBe(false);
    for (const issue of result.success ? [] : result.error.issues) {
      expect(issue.message).toMatch(/^validation:[A-Za-z]+(\|.*)?$/);
      expect(issue.message).not.toMatch(/high|abnormal/i);
    }
  });

  it("everything the form accepts also passes the FND-03 submit contract", () => {
    const contract = createScreeningInputSchema({ limits: DEMO_PLAUSIBILITY_LIMITS, now });
    const samples: Partial<ScreeningFormValues>[] = [
      {},
      { glucoseValue: "7,8", glucoseUnit: "mmol/L", glucoseContext: "not_recorded" },
      {
        systolic: "260",
        diastolic: "159",
        glucoseValue: "630",
        glucoseUnit: "mg/dL",
        glucoseContext: "fasting",
      },
      { measuredAt: iso(-29 * 1440 * MIN), notes: "Visit at home" },
    ];
    for (const sample of samples) {
      const values = { ...valid, ...sample };
      expect(schema.safeParse(values).success).toBe(true);
      const input = toScreeningInput(values, {
        patientId: "patient-x",
        idempotencyKey: "0f0e3c3e-5a59-4a6b-9a1e-3b8c4a1d2e3f",
        now,
      });
      expect(contract.safeParse(input).success).toBe(true);
    }
  });
});

describe("draft ⇄ form", () => {
  const draft = {
    systolic: 128,
    diastolic: null,
    glucoseValue: 7.8,
    glucoseUnit: null,
    glucoseContext: "fasting",
    measuredAt: DEMO_CLOCK_DEFAULT_ISO,
    notes: "n",
  } as unknown as Screening;

  it("saves partial / unvalidated values; units stay unselected until chosen", () => {
    const values = draftToFormValues(draft);
    expect(values).toEqual({
      systolic: "128",
      diastolic: "",
      glucoseValue: "7.8",
      glucoseUnit: null,
      glucoseContext: "fasting",
      measuredAt: DEMO_CLOCK_DEFAULT_ISO,
      notes: "n",
    });
    expect(formValuesToDraftPatch({ ...values, systolic: "999", glucoseValue: "7,8" })).toEqual({
      measuredAt: DEMO_CLOCK_DEFAULT_ISO,
      systolic: 999,
      diastolic: null,
      glucoseValue: 7.8,
      glucoseUnit: null,
      glucoseContext: "fasting",
      notes: "n",
    });
    expect(draftSignature(values)).toBe(draftSignature({ ...values }));
    expect(draftSignature(values)).not.toBe(draftSignature({ ...values, systolic: "12" }));
  });

  it("completeness counts the 5 reading fields", () => {
    expect(draftCompleteness(draft)).toEqual({ count: 3, total: 5 });
  });
});
