/**
 * Illustrative placeholders for software demonstration only. Not derived from, and must not be
 * presented as, Rwanda-approved or international clinical guidance.
 *
 * DEMO_RULE_NOT_CLINICALLY_VALIDATED. The numbers below are the proposed placeholders of
 * phases/00-foundation/INDEX.md (product-owner open item 1) and are externally configured here so
 * the rules engine in @laif/domain contains no thresholds of its own (tech spec §5.3).
 *
 * This is the single ruleset version used everywhere: phase text saying `demo-0.4` means
 * `demo-ruleset-2026.10-v1`; the retired `demo-0.3` is `demo-ruleset-2026.07-v0` (admin overlay only).
 */
import { DEMO_RULE_DISCLAIMER, type DemoRuleset, type ReasonCode } from "@laif/domain";

import { DEMO_PLAUSIBILITY_LIMITS } from "./plausibility.ts";

export const DEMO_RULESET_VERSION = "demo-ruleset-2026.10-v1" as const;
/** Retired version name reserved for the ADM-01 admin overlay. */
export const DEMO_RULESET_RETIRED_VERSION = "demo-ruleset-2026.07-v0" as const;

export const DEMO_RULESET_V1: DemoRuleset = {
  version: DEMO_RULESET_VERSION,
  status: "active",
  label: DEMO_RULE_DISCLAIMER,
  approvedBy: null,
  effectiveFrom: "2026-08-01T00:00:00.000Z",
  requiredInputs: ["systolic", "diastolic"],
  thresholds: {
    DEMO_SYSTOLIC_REVIEW_AT_OR_ABOVE: 145,
    DEMO_DIASTOLIC_REVIEW_AT_OR_ABOVE: 95,
    DEMO_GLUCOSE_REVIEW_AT_OR_ABOVE_MMOL: { fasting: 7.5, non_fasting: 11.5, not_recorded: 11.5 },
  },
  plausibility: DEMO_PLAUSIBILITY_LIMITS,
  synthetic: true,
};

/**
 * The retired ruleset of the ADM-01 admin analytics overlay (ruleset history, ADM-06/08). Same
 * DEMO_RULE_NOT_CLINICALLY_VALIDATED status; placeholder numbers only, never clinical guidance.
 */
export const DEMO_RULESET_V0: DemoRuleset = {
  version: DEMO_RULESET_RETIRED_VERSION,
  status: "retired",
  label: DEMO_RULE_DISCLAIMER,
  approvedBy: null,
  effectiveFrom: "2026-05-01T00:00:00.000Z",
  effectiveTo: DEMO_RULESET_V1.effectiveFrom,
  requiredInputs: ["systolic", "diastolic"],
  thresholds: {
    DEMO_SYSTOLIC_REVIEW_AT_OR_ABOVE: 140,
    DEMO_DIASTOLIC_REVIEW_AT_OR_ABOVE: 90,
    DEMO_GLUCOSE_REVIEW_AT_OR_ABOVE_MMOL: { fasting: 7.0, non_fasting: 11.1, not_recorded: 11.1 },
  },
  plausibility: DEMO_PLAUSIBILITY_LIMITS,
  synthetic: true,
};

/**
 * Ruleset history metadata (ADM-08 `listRulesets`): who recorded each version, a change-summary
 * code (UI copy `admin:governance.rulesets.change.<code>`) and the reason codes the version can
 * emit. `demo_configuration` = the demo's own configuration file — never a clinical approval.
 * Not part of the seed dataset (keeps `SEED_DATASET_HASH` stable).
 */
export const DEMO_RULESET_HISTORY: Readonly<
  Record<
    string,
    { changedBy: string; changeSummaryKey: string; reasonCodes: readonly ReasonCode[] }
  >
> = {
  [DEMO_RULESET_VERSION]: {
    changedBy: "demo_configuration",
    changeSummaryKey: "placeholders_revised",
    reasonCodes: [
      "DEMO_BP_SYSTOLIC_AT_OR_ABOVE_THRESHOLD",
      "DEMO_BP_DIASTOLIC_AT_OR_ABOVE_THRESHOLD",
      "DEMO_GLUCOSE_AT_OR_ABOVE_THRESHOLD",
      "GLUCOSE_UNIT_MISSING",
      "GLUCOSE_CONTEXT_NOT_RECORDED",
    ],
  },
  [DEMO_RULESET_RETIRED_VERSION]: {
    changedBy: "demo_configuration",
    changeSummaryKey: "initial_placeholders",
    reasonCodes: [
      "DEMO_BP_SYSTOLIC_AT_OR_ABOVE_THRESHOLD",
      "DEMO_BP_DIASTOLIC_AT_OR_ABOVE_THRESHOLD",
      "DEMO_GLUCOSE_AT_OR_ABOVE_THRESHOLD",
      "GLUCOSE_UNIT_MISSING",
    ],
  },
};
