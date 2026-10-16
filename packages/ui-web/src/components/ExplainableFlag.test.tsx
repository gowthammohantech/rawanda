import type { FlagResult } from "@laif/domain";
import { screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { expectNoAxeViolations, renderUi } from "../test/helpers.tsx";
import { ExplainableFlag } from "./ExplainableFlag.tsx";

const flag: FlagResult = {
  requiresReview: true,
  evaluable: true,
  reasonCodes: ["DEMO_BP_SYSTOLIC_AT_OR_ABOVE_THRESHOLD", "GLUCOSE_CONTEXT_NOT_RECORDED"],
  triggeringObservations: [{ code: "SYSTOLIC", value: 152, unit: "mmHg", comparedTo: 145 }],
  rulesetVersion: "demo-ruleset-2026.10-v1",
  displayDisclaimer: "DEMO_RULE_NOT_CLINICALLY_VALIDATED",
};

describe("ExplainableFlag", () => {
  it("explains reasons, observations, ruleset, inputs and the disclaimer", async () => {
    const { container } = renderUi(
      <ExplainableFlag
        flag={flag}
        inputs={{
          systolic: 152,
          diastolic: 96,
          glucoseValue: 9.1,
          glucoseUnit: "mmol/L",
          glucoseContext: null,
        }}
      />,
    );
    expect(screen.getByText("Needs review")).toBeTruthy();
    expect(container.querySelectorAll("[data-reason]")).toHaveLength(2);
    for (const item of container.querySelectorAll("[data-reason]")) {
      expect(item.textContent).not.toMatch(/^[A-Z_]+$/);
    }
    expect(screen.getByText("Ruleset demo-ruleset-2026.10-v1")).toBeTruthy();
    expect(screen.getByText("152 mmHg — demo threshold 145 mmHg")).toBeTruthy();
    expect(screen.getByText("152/96 mmHg")).toBeTruthy();
    expect(screen.getByText("DEMO_RULE_NOT_CLINICALLY_VALIDATED")).toBeTruthy();
    await expectNoAxeViolations(container);
  });

  it("shows not-evaluable flags as routed to a person (RW)", () => {
    renderUi(
      <ExplainableFlag
        flag={{
          ...flag,
          evaluable: false,
          reasonCodes: ["GLUCOSE_UNIT_MISSING"],
          triggeringObservations: [],
        }}
        compact
      />,
      { language: "rw" },
    );
    expect(screen.getByText("Ntibyasuzumwa — bikeneye umuntu")).toBeTruthy();
  });
});
