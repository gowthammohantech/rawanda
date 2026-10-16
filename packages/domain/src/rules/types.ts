/**
 * Types of the illustrative demo rules engine (tech spec §5.3). Types only: the actual
 * ruleset numbers live in `@laif/mock-data` config (FND-05) and are labelled
 * `DEMO_RULE_NOT_CLINICALLY_VALIDATED`.
 */
import type { GlucoseContext, GlucoseUnit } from "../enums.ts";
import type { PersonaId } from "../ids.ts";

export const DEMO_RULE_DISCLAIMER = "DEMO_RULE_NOT_CLINICALLY_VALIDATED" as const;
export type DemoRuleDisclaimer = typeof DEMO_RULE_DISCLAIMER;

/** The only reason codes any app may display (UI text via `domain:reason.<code>`). */
export const REASON_CODES = [
  "DEMO_BP_SYSTOLIC_AT_OR_ABOVE_THRESHOLD",
  "DEMO_BP_DIASTOLIC_AT_OR_ABOVE_THRESHOLD",
  "DEMO_GLUCOSE_AT_OR_ABOVE_THRESHOLD",
  "GLUCOSE_UNIT_MISSING",
  "GLUCOSE_CONTEXT_NOT_RECORDED",
] as const;
export type ReasonCode = (typeof REASON_CODES)[number];

export const OBSERVATION_CODES = ["SYSTOLIC", "DIASTOLIC", "GLUCOSE"] as const;
export type ObservationCode = (typeof OBSERVATION_CODES)[number];

export type TriggeringObservation = {
  code: ObservationCode;
  /** Compared value; glucose is normalised to mmol/L. */
  value: number;
  unit: string;
  /** The ruleset threshold the value was compared to (same unit). */
  comparedTo: number;
};

export type FlagResult = {
  requiresReview: boolean;
  /** False when inputs were incomplete (e.g. missing glucose unit): routed to a human. */
  evaluable: boolean;
  reasonCodes: ReasonCode[];
  triggeringObservations: TriggeringObservation[];
  rulesetVersion: string;
  displayDisclaimer: DemoRuleDisclaimer;
};

export type DemoThresholds = {
  DEMO_SYSTOLIC_REVIEW_AT_OR_ABOVE: number;
  DEMO_DIASTOLIC_REVIEW_AT_OR_ABOVE: number;
  DEMO_GLUCOSE_REVIEW_AT_OR_ABOVE_MMOL: Record<GlucoseContext, number>;
};

export type NumericRange = { min: number; max: number };

/** Data-entry plausibility ranges (not clinical thresholds). */
export type PlausibilityLimits = {
  systolic: NumericRange;
  diastolic: NumericRange;
  glucoseMmol: NumericRange;
  glucoseMgDl: NumericRange;
};

/** Inputs that `requiredInputs` may name. */
export const RULE_INPUT_FIELDS = ["systolic", "diastolic", "glucoseValue"] as const;
export type RuleInputField = (typeof RULE_INPUT_FIELDS)[number];

export type DemoRuleset = {
  version: string;
  status: "active" | "retired";
  label: DemoRuleDisclaimer;
  /** No ruleset is clinically approved in the prototype. */
  approvedBy: null;
  effectiveFrom: string;
  effectiveTo?: string;
  /** Inputs that must be present for the ruleset to evaluate (names from RULE_INPUT_FIELDS). */
  requiredInputs: string[];
  thresholds: DemoThresholds;
  plausibility: PlausibilityLimits;
};

export type ScreeningEvaluationInput = {
  systolic: number | null;
  diastolic: number | null;
  glucoseValue: number | null;
  glucoseUnit: GlucoseUnit | null;
  glucoseContext: GlucoseContext | null;
};

/** Frozen copy of the flag and its inputs at flag time; never mutated by amendments. */
export type EvidenceSnapshot = {
  flag: FlagResult;
  inputs: ScreeningEvaluationInput;
  capturedAt: string;
  capturedBy: PersonaId | null;
};
