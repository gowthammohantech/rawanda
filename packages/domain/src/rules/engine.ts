/**
 * Illustrative, explainable demo rules engine (tech spec §5.3).
 *
 * This module contains NO thresholds of its own: every comparison uses
 * `ruleset.thresholds` from an externally configured, labelled DEMO ruleset
 * (`DEMO_RULE_NOT_CLINICALLY_VALIDATED`). The only numeric literal is the glucose unit
 * conversion factor, which is a unit conversion, not a clinical threshold (a test asserts
 * this by reading this file). Outputs are reason codes only — never diagnosis or treatment
 * words. A clinician reviews every flagged result before any clinical action.
 */
import { GLUCOSE_CONTEXTS, GLUCOSE_UNITS } from "../enums.ts";
import type { GlucoseContext, GlucoseUnit } from "../enums.ts";
import {
  DEMO_RULE_DISCLAIMER,
  RULE_INPUT_FIELDS,
  type DemoRuleset,
  type FlagResult,
  type ReasonCode,
  type ScreeningEvaluationInput,
  type TriggeringObservation,
} from "./types.ts";

/** mg/dL → mmol/L for glucose (unit conversion only). */
export const GLUCOSE_MGDL_PER_MMOL = 18.016;

const MMOL: GlucoseUnit = "mmol/L";
const MMHG = "mmHg";

const isKnownUnit = (unit: unknown): unit is GlucoseUnit =>
  (GLUCOSE_UNITS as readonly unknown[]).includes(unit);
const isKnownContext = (context: unknown): context is GlucoseContext =>
  (GLUCOSE_CONTEXTS as readonly unknown[]).includes(context);

/** Converts a glucose value to mmol/L. */
export function toMmolPerL(value: number, unit: GlucoseUnit): number {
  return unit === MMOL ? value : value / GLUCOSE_MGDL_PER_MMOL;
}

export function evaluateScreening(
  input: ScreeningEvaluationInput,
  ruleset: DemoRuleset,
): FlagResult {
  const result = (
    partial: Pick<FlagResult, "requiresReview" | "evaluable" | "reasonCodes"> & {
      triggeringObservations?: TriggeringObservation[];
    },
  ): FlagResult => ({
    triggeringObservations: [],
    ...partial,
    rulesetVersion: ruleset.version,
    displayDisclaimer: DEMO_RULE_DISCLAIMER,
  });

  // (a) Validate inputs, units and context before any rule evaluation. Incomplete data is
  // not evaluable and goes to a human (★ safe default).
  const missingRequired = ruleset.requiredInputs.some(
    (field) =>
      (RULE_INPUT_FIELDS as readonly string[]).includes(field) &&
      input[field as (typeof RULE_INPUT_FIELDS)[number]] === null,
  );
  if (missingRequired) {
    return result({ requiresReview: true, evaluable: false, reasonCodes: [] });
  }

  const hasGlucose = input.glucoseValue !== null;
  if (hasGlucose && !isKnownUnit(input.glucoseUnit)) {
    return result({
      requiresReview: true,
      evaluable: false,
      reasonCodes: ["GLUCOSE_UNIT_MISSING"],
    });
  }
  if (hasGlucose && !isKnownContext(input.glucoseContext)) {
    return result({
      requiresReview: true,
      evaluable: false,
      reasonCodes: ["GLUCOSE_CONTEXT_NOT_RECORDED"],
    });
  }

  // (b) + (c) Normalise and compare only against the ruleset thresholds.
  const { thresholds } = ruleset;
  const reasonCodes: ReasonCode[] = [];
  const triggeringObservations: TriggeringObservation[] = [];

  if (input.systolic !== null && input.systolic >= thresholds.DEMO_SYSTOLIC_REVIEW_AT_OR_ABOVE) {
    reasonCodes.push("DEMO_BP_SYSTOLIC_AT_OR_ABOVE_THRESHOLD");
    triggeringObservations.push({
      code: "SYSTOLIC",
      value: input.systolic,
      unit: MMHG,
      comparedTo: thresholds.DEMO_SYSTOLIC_REVIEW_AT_OR_ABOVE,
    });
  }
  if (input.diastolic !== null && input.diastolic >= thresholds.DEMO_DIASTOLIC_REVIEW_AT_OR_ABOVE) {
    reasonCodes.push("DEMO_BP_DIASTOLIC_AT_OR_ABOVE_THRESHOLD");
    triggeringObservations.push({
      code: "DIASTOLIC",
      value: input.diastolic,
      unit: MMHG,
      comparedTo: thresholds.DEMO_DIASTOLIC_REVIEW_AT_OR_ABOVE,
    });
  }

  let contextNotRecorded = false;
  if (
    input.glucoseValue !== null &&
    isKnownUnit(input.glucoseUnit) &&
    isKnownContext(input.glucoseContext)
  ) {
    const mmol = toMmolPerL(input.glucoseValue, input.glucoseUnit);
    const threshold = thresholds.DEMO_GLUCOSE_REVIEW_AT_OR_ABOVE_MMOL[input.glucoseContext];
    if (mmol >= threshold) {
      reasonCodes.push("DEMO_GLUCOSE_AT_OR_ABOVE_THRESHOLD");
      triggeringObservations.push({
        code: "GLUCOSE",
        value: mmol,
        unit: MMOL,
        comparedTo: threshold,
      });
    }
    contextNotRecorded = input.glucoseContext === "not_recorded";
  }

  const requiresReview = Boolean(reasonCodes.length);
  // Informational: the explicit `not_recorded` context is surfaced for the reviewer.
  if (contextNotRecorded) reasonCodes.push("GLUCOSE_CONTEXT_NOT_RECORDED");

  return result({ requiresReview, evaluable: true, reasonCodes, triggeringObservations });
}
