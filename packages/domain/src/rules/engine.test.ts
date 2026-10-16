import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import { makeRuleset } from "../testing/fixtures.ts";
import { GLUCOSE_MGDL_PER_MMOL, evaluateScreening, toMmolPerL } from "./engine.ts";
import { REASON_CODES, type ScreeningEvaluationInput } from "./types.ts";

const normal: ScreeningEvaluationInput = {
  systolic: 120,
  diastolic: 80,
  glucoseValue: 5.5,
  glucoseUnit: "mmol/L",
  glucoseContext: "fasting",
};
const ruleset = makeRuleset();

describe("evaluateScreening", () => {
  it("does not require review when all values are below the demo thresholds", () => {
    expect(evaluateScreening(normal, ruleset)).toEqual({
      requiresReview: false,
      evaluable: true,
      reasonCodes: [],
      triggeringObservations: [],
      rulesetVersion: "test-ruleset-v1",
      displayDisclaimer: "DEMO_RULE_NOT_CLINICALLY_VALIDATED",
    });
  });

  it("flags systolic / diastolic at (not only above) the threshold", () => {
    const result = evaluateScreening({ ...normal, systolic: 150, diastolic: 100 }, ruleset);
    expect(result.requiresReview).toBe(true);
    expect(result.reasonCodes).toEqual([
      "DEMO_BP_SYSTOLIC_AT_OR_ABOVE_THRESHOLD",
      "DEMO_BP_DIASTOLIC_AT_OR_ABOVE_THRESHOLD",
    ]);
    expect(result.triggeringObservations).toEqual([
      { code: "SYSTOLIC", value: 150, unit: "mmHg", comparedTo: 150 },
      { code: "DIASTOLIC", value: 100, unit: "mmHg", comparedTo: 100 },
    ]);
    expect(evaluateScreening({ ...normal, systolic: 149 }, ruleset).requiresReview).toBe(false);
  });

  it("uses the context-specific glucose threshold", () => {
    const glucose = (value: number, glucoseContext: ScreeningEvaluationInput["glucoseContext"]) =>
      evaluateScreening({ ...normal, glucoseValue: value, glucoseContext }, ruleset).reasonCodes;
    expect(glucose(8, "fasting")).toEqual(["DEMO_GLUCOSE_AT_OR_ABOVE_THRESHOLD"]);
    expect(glucose(8, "non_fasting")).toEqual([]);
    expect(glucose(12, "non_fasting")).toEqual(["DEMO_GLUCOSE_AT_OR_ABOVE_THRESHOLD"]);
  });

  it("converts mg/dL to mmol/L before comparison", () => {
    expect(toMmolPerL(GLUCOSE_MGDL_PER_MMOL * 8, "mg/dL")).toBeCloseTo(8, 10);
    expect(toMmolPerL(7, "mmol/L")).toBe(7);
    const flagged = evaluateScreening(
      { ...normal, glucoseValue: 145, glucoseUnit: "mg/dL", glucoseContext: "fasting" },
      ruleset,
    );
    expect(flagged.reasonCodes).toEqual(["DEMO_GLUCOSE_AT_OR_ABOVE_THRESHOLD"]);
    expect(flagged.triggeringObservations[0]).toMatchObject({
      code: "GLUCOSE",
      unit: "mmol/L",
      comparedTo: 8,
    });
    expect(flagged.triggeringObservations[0]?.value).toBeCloseTo(145 / 18.016, 10);
    const below = evaluateScreening(
      { ...normal, glucoseValue: 144, glucoseUnit: "mg/dL", glucoseContext: "fasting" },
      ruleset,
    );
    expect(below.requiresReview).toBe(false);
  });

  it("missing glucose unit → not evaluable, requires review, GLUCOSE_UNIT_MISSING only", () => {
    const result = evaluateScreening({ ...normal, systolic: 200, glucoseUnit: null }, ruleset);
    expect(result).toMatchObject({
      evaluable: false,
      requiresReview: true,
      reasonCodes: ["GLUCOSE_UNIT_MISSING"],
      triggeringObservations: [],
    });
    const unknownUnit = { ...normal, glucoseUnit: "g/L" as never };
    expect(evaluateScreening(unknownUnit, ruleset).reasonCodes).toEqual(["GLUCOSE_UNIT_MISSING"]);
  });

  it("missing unit without a glucose value is fine", () => {
    const result = evaluateScreening(
      { ...normal, glucoseValue: null, glucoseUnit: null, glucoseContext: null },
      ruleset,
    );
    expect(result).toMatchObject({ evaluable: true, requiresReview: false, reasonCodes: [] });
  });

  it("unknown / null glucose context → not evaluable, requires review", () => {
    for (const glucoseContext of [null, "random" as never]) {
      expect(evaluateScreening({ ...normal, glucoseContext }, ruleset)).toMatchObject({
        evaluable: false,
        requiresReview: true,
        reasonCodes: ["GLUCOSE_CONTEXT_NOT_RECORDED"],
      });
    }
  });

  it("explicit not_recorded context is evaluated and surfaced as an informational code", () => {
    const low = evaluateScreening({ ...normal, glucoseContext: "not_recorded" }, ruleset);
    expect(low).toMatchObject({
      evaluable: true,
      requiresReview: false,
      reasonCodes: ["GLUCOSE_CONTEXT_NOT_RECORDED"],
    });
    const high = evaluateScreening(
      { ...normal, glucoseValue: 12, glucoseContext: "not_recorded" },
      ruleset,
    );
    expect(high.requiresReview).toBe(true);
    expect(high.reasonCodes).toEqual([
      "DEMO_GLUCOSE_AT_OR_ABOVE_THRESHOLD",
      "GLUCOSE_CONTEXT_NOT_RECORDED",
    ]);
  });

  it("missing required inputs → not evaluable, routed to review", () => {
    const result = evaluateScreening({ ...normal, systolic: null }, ruleset);
    expect(result).toMatchObject({ evaluable: false, requiresReview: true, reasonCodes: [] });
    const lenient = makeRuleset({ requiredInputs: ["unknown_field"] });
    expect(evaluateScreening({ ...normal, systolic: null }, lenient).evaluable).toBe(true);
  });

  it("changing a threshold in the ruleset changes the result", () => {
    const input = { ...normal, systolic: 140 };
    expect(evaluateScreening(input, ruleset).requiresReview).toBe(false);
    const stricter = makeRuleset({
      version: "test-ruleset-v2",
      thresholds: { ...ruleset.thresholds, DEMO_SYSTOLIC_REVIEW_AT_OR_ABOVE: 140 },
    });
    const result = evaluateScreening(input, stricter);
    expect(result.requiresReview).toBe(true);
    expect(result.rulesetVersion).toBe("test-ruleset-v2");
  });

  it("never emits diagnosis words", () => {
    const inputs: ScreeningEvaluationInput[] = [
      normal,
      { ...normal, systolic: 250, diastolic: 150, glucoseValue: 30 },
      { ...normal, glucoseUnit: null },
      { ...normal, glucoseContext: null },
      { ...normal, glucoseContext: "not_recorded" },
    ];
    for (const input of inputs) {
      expect(JSON.stringify(evaluateScreening(input, ruleset))).not.toMatch(
        /hypertens|diabet|diagnos/i,
      );
    }
    expect(JSON.stringify(REASON_CODES)).not.toMatch(/hypertens|diabet|diagnos/i);
  });

  it("engine source has no numeric literals other than the unit conversion factor", () => {
    const source = readFileSync(fileURLToPath(new URL("./engine.ts", import.meta.url)), "utf8");
    const code = source
      .replace(/\/\*[\s\S]*?\*\//gu, "")
      .replace(/\/\/.*$/gmu, "")
      .replace(/(["'`])(?:\\.|(?!\1).)*\1/gu, "");
    const literals = code.match(/(?<![\w.])\d+(?:\.\d+)?(?![\w.])/gu) ?? [];
    expect(literals).toEqual(["18.016"]);
  });
});
