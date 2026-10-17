/**
 * CLN-06 evidence panel: every evidence item with value + unit and its status pill (text + icon;
 * MISSING / NOT EVALUATED amber), the demo rule text, thresholds only with "Demo placeholder
 * value", the amended-after-flag callout with its correction-history link, and the empty state.
 */
import { evaluateScreening, explainFlag, type EvidenceSnapshot } from "@laif/domain";
import { DEMO_RULESET_V1 } from "@laif/mock-data";
import { renderWithProviders } from "@laif/test-utils/web";
import { screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { EvidencePanel } from "../EvidencePanel.tsx";

const VERSION = DEMO_RULESET_V1.version;

function snap(inputs: EvidenceSnapshot["inputs"]): EvidenceSnapshot {
  return {
    flag: evaluateScreening(inputs, DEMO_RULESET_V1),
    inputs,
    capturedAt: "2026-10-13T08:00:00.000Z",
    capturedBy: null,
  };
}

function renderPanel(snapshot: EvidenceSnapshot, extra: { amended?: boolean } = {}) {
  const { items } = explainFlag(snapshot, null, DEMO_RULESET_V1);
  return renderWithProviders(
    <EvidencePanel
      items={items}
      flag={snapshot.flag}
      rulesetVersion={VERSION}
      amendedAfterFlag={extra.amended ?? false}
      historyHref="/clinical/patients/p1?tab=screenings"
    />,
  );
}

const row = (input: string) =>
  screen.getAllByTestId("evidence-row").find((r) => r.getAttribute("data-input") === input);

describe("EvidencePanel", () => {
  it("WF-01 style: triggering inputs with value + unit, rule text and labelled threshold", () => {
    renderPanel(
      snap({
        systolic: 162,
        diastolic: 98,
        glucoseValue: 13.4,
        glucoseUnit: "mmol/L",
        glucoseContext: "non_fasting",
      }),
    );
    expect(screen.getAllByTestId("evidence-row")).toHaveLength(5);
    const systolic = row("systolic") as HTMLElement;
    expect(systolic.getAttribute("data-status")).toBe("TRIGGERED");
    expect(within(systolic).getByText("162 mmHg")).toBeTruthy();
    expect(within(systolic).getByText("Triggered")).toBeTruthy();
    expect(systolic.textContent).toContain(`Demo threshold: configured in ${VERSION}`);
    expect(systolic.textContent).toContain(`${VERSION}/BP-1`);
    const glucose = row("glucoseValue") as HTMLElement;
    expect(within(glucose).getByText("13.4 mmol/L")).toBeTruthy();
    expect(glucose.getAttribute("data-status")).toBe("TRIGGERED");
    // A numeric threshold only ever appears with the demo placeholder label.
    for (const threshold of screen.getAllByTestId("evidence-threshold")) {
      expect(threshold.textContent).toMatch(/Compared with \d/u);
      expect(threshold.textContent).toContain("Demo placeholder value");
    }
    expect(screen.getByText("Diastolic blood pressure")).toBeTruthy();
    expect(screen.queryByTestId("evidence-amended")).toBeNull();
  });

  it("missing unit: MISSING and NOT EVALUATED pills with icon + text", () => {
    renderPanel(
      snap({
        systolic: 136,
        diastolic: 84,
        glucoseValue: 9.2,
        glucoseUnit: null,
        glucoseContext: "non_fasting",
      }),
    );
    const unit = row("glucoseUnit") as HTMLElement;
    expect(unit.getAttribute("data-status")).toBe("MISSING");
    expect(within(unit).getByText("Missing")).toBeTruthy();
    expect(within(unit).getByText("Not recorded")).toBeTruthy();
    expect(unit.querySelector("svg")).not.toBeNull();
    const glucose = row("glucoseValue") as HTMLElement;
    expect(glucose.getAttribute("data-status")).toBe("NOT_EVALUATED");
    expect(within(glucose).getByText("Not evaluated")).toBeTruthy();
    expect(within(glucose).getByText("9.2")).toBeTruthy();
    expect(screen.queryAllByTestId("evidence-threshold")).toHaveLength(0);
  });

  it("amended after flag: callout links to the correction history", () => {
    renderPanel(
      snap({
        systolic: 150,
        diastolic: 80,
        glucoseValue: null,
        glucoseUnit: null,
        glucoseContext: null,
      }),
      { amended: true },
    );
    const callout = screen.getByTestId("evidence-amended");
    expect(callout.textContent).toContain("Evidence amended after flag — see correction history");
    expect(
      within(callout).getByRole("link", { name: "Open correction history" }).getAttribute("href"),
    ).toBe("/clinical/patients/p1?tab=screenings");
  });

  it("no evidence items → cannot be reviewed", () => {
    renderWithProviders(<EvidencePanel items={[]} flag={null} rulesetVersion={VERSION} />);
    expect(screen.getByTestId("evidence-empty").textContent).toContain(
      "No evidence captured — cannot be reviewed; contact data quality",
    );
  });
});
