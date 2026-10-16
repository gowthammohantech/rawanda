import { evaluateScreening, REASON_CODES } from "@laif/domain";
import { describe, expect, it } from "vitest";

import { DEMO_RULESET_V1 } from "../config/demo-ruleset.ts";
import { createSeed } from "./generate.ts";

const seed = createSeed();

describe("seeded flags agree with the demo rules engine", () => {
  it("every non-draft screening's stored flag equals evaluateScreening(original inputs, DEMO_RULESET_V1)", () => {
    const submitted = seed.screenings.filter((s) => s.status !== "draft");
    expect(submitted).toHaveLength(57);
    for (const s of submitted) {
      const expected = evaluateScreening(
        {
          systolic: s.systolic,
          diastolic: s.diastolic,
          glucoseValue: s.glucoseValue,
          glucoseUnit: s.glucoseUnit,
          glucoseContext: s.glucoseContext,
        },
        DEMO_RULESET_V1,
      );
      expect(s.flag, s.id).toEqual(expected);
      expect(s.status).toBe(expected.requiresReview ? "review_required" : "no_review_required");
      expect(s.rulesetVersion).toBe(DEMO_RULESET_V1.version);
    }
  });

  it("drafts carry no flag and no ruleset version", () => {
    for (const s of seed.screenings.filter((x) => x.status === "draft")) {
      expect(s.flag).toBeNull();
      expect(s.rulesetVersion).toBeNull();
    }
  });

  it("review evidence snapshots freeze the screening flag", () => {
    for (const r of seed.reviews) {
      const s = seed.screenings.find((x) => x.id === r.screeningId);
      expect(r.evidenceSnapshot.flag).toEqual(s?.flag);
      expect(r.flagReasons).toEqual(s?.flag?.reasonCodes);
    }
  });

  it("only uses FND-02 reason codes", () => {
    const codes = seed.screenings.flatMap((s) => s.flag?.reasonCodes ?? []);
    for (const code of codes) expect(REASON_CODES).toContain(code);
    expect(codes).toContain("GLUCOSE_UNIT_MISSING");
  });
});
