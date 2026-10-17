import { describe, expect, it } from "vitest";

import { makeRuleset } from "../testing/fixtures.ts";
import { evaluateScreening } from "./engine.ts";
import { explainFlag } from "./explain.ts";
import type { EvidenceSnapshot, ScreeningEvaluationInput } from "./types.ts";

const ruleset = makeRuleset();

function snapshotOf(inputs: ScreeningEvaluationInput): EvidenceSnapshot {
  return {
    flag: evaluateScreening(inputs, ruleset),
    inputs,
    capturedAt: "2026-10-13T08:00:00.000Z",
    capturedBy: null,
  };
}

const statusOf = (snapshot: EvidenceSnapshot, observations = [] as never[]) =>
  Object.fromEntries(
    explainFlag(snapshot, { observations }, ruleset).items.map((i) => [i.inputKey, i.status]),
  );

describe("explainFlag", () => {
  it("marks triggering inputs TRIGGERED with value, unit and rule ref", () => {
    const snapshot = snapshotOf({
      systolic: 200,
      diastolic: 60,
      glucoseValue: 30,
      glucoseUnit: "mmol/L",
      glucoseContext: "non_fasting",
    });
    const result = explainFlag(snapshot, null, ruleset);
    expect(result.rulesetVersion).toBe(ruleset.version);
    const systolic = result.items.find((i) => i.inputKey === "systolic");
    expect(systolic).toEqual({
      inputKey: "systolic",
      value: 200,
      unit: "mmHg",
      ruleRef: `${ruleset.version}/BP-1`,
      ruleDescriptionKey: "BP-1",
      status: "TRIGGERED",
    });
    expect(statusOf(snapshot)).toEqual({
      systolic: "TRIGGERED",
      diastolic: "WITHIN_DEMO_RANGE",
      glucoseValue: "TRIGGERED",
      glucoseUnit: "WITHIN_DEMO_RANGE",
      glucoseContext: "WITHIN_DEMO_RANGE",
    });
    expect(result.completeness).toEqual({
      required: ["systolic", "diastolic", "glucoseValue", "glucoseUnit", "glucoseContext"],
      present: ["systolic", "diastolic", "glucoseValue", "glucoseUnit", "glucoseContext"],
      missing: [],
    });
  });

  it("a missing glucose unit → unit MISSING, glucose NOT_EVALUATED, 4 of 5 present", () => {
    const snapshot = snapshotOf({
      systolic: 120,
      diastolic: 80,
      glucoseValue: 9.2,
      glucoseUnit: null,
      glucoseContext: "non_fasting",
    });
    expect(statusOf(snapshot)).toEqual({
      systolic: "NOT_EVALUATED",
      diastolic: "NOT_EVALUATED",
      glucoseValue: "NOT_EVALUATED",
      glucoseUnit: "MISSING",
      glucoseContext: "NOT_EVALUATED",
    });
    const { completeness } = explainFlag(snapshot, null, ruleset);
    expect(completeness.present).toHaveLength(4);
    expect(completeness.missing).toEqual(["glucoseUnit"]);
  });

  it("a missing required input is MISSING; no glucose → no glucose rows", () => {
    const snapshot = snapshotOf({
      systolic: null,
      diastolic: 80,
      glucoseValue: null,
      glucoseUnit: null,
      glucoseContext: null,
    });
    expect(statusOf(snapshot)).toEqual({ systolic: "MISSING", diastolic: "NOT_EVALUATED" });
    expect(explainFlag(snapshot, null, ruleset).completeness.missing).toEqual(["systolic"]);
  });

  it("an explicit 'not recorded' fasting status counts as missing", () => {
    const snapshot = snapshotOf({
      systolic: 120,
      diastolic: 80,
      glucoseValue: 5,
      glucoseUnit: "mmol/L",
      glucoseContext: "not_recorded",
    });
    expect(statusOf(snapshot).glucoseContext).toBe("MISSING");
  });

  it("repeat readings from the screening are listed as NOT_EVALUATED", () => {
    const snapshot = snapshotOf({
      systolic: 150,
      diastolic: 80,
      glucoseValue: null,
      glucoseUnit: null,
      glucoseContext: null,
    });
    const repeat = explainFlag(
      snapshot,
      {
        observations: [
          { code: "SYSTOLIC_REPEAT", value: 134, unit: "mmHg" },
          { code: "DIASTOLIC_REPEAT", value: 84, unit: "mmHg" },
        ],
      },
      ruleset,
    ).items.find((i) => i.inputKey === "repeatReading");
    expect(repeat).toMatchObject({ value: "134/84", unit: "mmHg", status: "NOT_EVALUATED" });
    expect(repeat?.ruleRef).toBeNull();
  });
});
