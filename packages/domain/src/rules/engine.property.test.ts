import fc from "fast-check";
import { describe, expect, it } from "vitest";

import { GLUCOSE_CONTEXTS, GLUCOSE_UNITS } from "../enums.ts";
import { makeRuleset } from "../testing/fixtures.ts";
import { evaluateScreening } from "./engine.ts";
import { REASON_CODES, type DemoRuleset, type ScreeningEvaluationInput } from "./types.ts";

const finite = (min: number, max: number) =>
  fc.double({ min, max, noNaN: true, noDefaultInfinity: true });

const inputArb: fc.Arbitrary<ScreeningEvaluationInput> = fc.record({
  systolic: fc.option(fc.integer({ min: 40, max: 300 }), { nil: null }),
  diastolic: fc.option(fc.integer({ min: 20, max: 200 }), { nil: null }),
  glucoseValue: fc.option(finite(0.5, 700), { nil: null }),
  glucoseUnit: fc.option(fc.constantFrom(...GLUCOSE_UNITS), { nil: null }),
  glucoseContext: fc.option(fc.constantFrom(...GLUCOSE_CONTEXTS), { nil: null }),
});

const rulesetArb: fc.Arbitrary<DemoRuleset> = fc
  .record({
    version: fc.string({ minLength: 1, maxLength: 30 }),
    systolic: fc.integer({ min: 60, max: 260 }),
    diastolic: fc.integer({ min: 30, max: 160 }),
    fasting: finite(1, 35),
    nonFasting: finite(1, 35),
    notRecorded: finite(1, 35),
    requiredInputs: fc.subarray(["systolic", "diastolic", "glucoseValue"]),
  })
  .map((r) =>
    makeRuleset({
      version: r.version,
      requiredInputs: r.requiredInputs,
      thresholds: {
        DEMO_SYSTOLIC_REVIEW_AT_OR_ABOVE: r.systolic,
        DEMO_DIASTOLIC_REVIEW_AT_OR_ABOVE: r.diastolic,
        DEMO_GLUCOSE_REVIEW_AT_OR_ABOVE_MMOL: {
          fasting: r.fasting,
          non_fasting: r.nonFasting,
          not_recorded: r.notRecorded,
        },
      },
    }),
  );

describe("evaluateScreening (property)", () => {
  it("always carries the disclaimer and the input ruleset version", () => {
    fc.assert(
      fc.property(inputArb, rulesetArb, (input, ruleset) => {
        const result = evaluateScreening(input, ruleset);
        expect(result.displayDisclaimer).toBe("DEMO_RULE_NOT_CLINICALLY_VALIDATED");
        expect(result.rulesetVersion).toBe(ruleset.version);
      }),
      { numRuns: 500 },
    );
  });

  it("emits only known reason codes, is deterministic, and never clears review for unevaluable data", () => {
    fc.assert(
      fc.property(inputArb, rulesetArb, (input, ruleset) => {
        const result = evaluateScreening(input, ruleset);
        for (const code of result.reasonCodes) expect(REASON_CODES).toContain(code);
        expect(evaluateScreening(input, ruleset)).toEqual(result);
        if (!result.evaluable) expect(result.requiresReview).toBe(true);
        if (result.evaluable) {
          expect(result.requiresReview).toBe(result.triggeringObservations.length > 0);
        }
        for (const obs of result.triggeringObservations) {
          expect(obs.value).toBeGreaterThanOrEqual(obs.comparedTo);
        }
        expect(JSON.stringify(result)).not.toMatch(/hypertens|diabet|diagnos/i);
      }),
      { numRuns: 500 },
    );
  });

  it("is monotonic in systolic: raising the value never clears a systolic flag", () => {
    fc.assert(
      fc.property(
        inputArb,
        rulesetArb,
        fc.integer({ min: 1, max: 50 }),
        (input, ruleset, delta) => {
          if (input.systolic === null) return;
          const code = "DEMO_BP_SYSTOLIC_AT_OR_ABOVE_THRESHOLD";
          const before = evaluateScreening(input, ruleset).reasonCodes.includes(code);
          const after = evaluateScreening(
            { ...input, systolic: input.systolic + delta },
            ruleset,
          ).reasonCodes.includes(code);
          if (before) expect(after).toBe(true);
        },
      ),
    );
  });
});
