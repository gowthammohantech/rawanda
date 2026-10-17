/**
 * CLN-06 flag header: the ruleset version, the demo-rule disclaimer and one plain-language
 * sentence per reason code (EN / RW); the ruleset chip opens the rules dialog with the
 * DEMO_RULE_NOT_CLINICALLY_VALIDATED status; every number shown is labelled "Demo placeholder
 * value"; never diagnosis wording.
 */
import { evaluateScreening, explainFlag, type EvidenceSnapshot } from "@laif/domain";
import { DEMO_RULESET_V1 } from "@laif/mock-data";
import { buildReview } from "@laif/test-utils";
import { renderWithProviders } from "@laif/test-utils/web";
import { screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";

import { rulesetFor } from "../hooks.ts";
import { ReviewFlagHeader } from "../ReviewFlagHeader.tsx";

const VERSION = DEMO_RULESET_V1.version;
const inputs = {
  systolic: 162,
  diastolic: 98,
  glucoseValue: 13.4,
  glucoseUnit: "mmol/L" as const,
  glucoseContext: "non_fasting" as const,
};
const snapshot: EvidenceSnapshot = {
  flag: evaluateScreening(inputs, DEMO_RULESET_V1),
  inputs,
  capturedAt: "2026-10-13T08:00:00.000Z",
  capturedBy: null,
};

function renderHeader(language: "en" | "rw" = "en", snap = snapshot) {
  const review = buildReview({ evidenceSnapshot: snap, flagReasons: snap.flag.reasonCodes });
  const { completeness } = explainFlag(snap, null, DEMO_RULESET_V1);
  return renderWithProviders(
    <ReviewFlagHeader
      review={review}
      snapshot={snap}
      completeness={completeness}
      ruleset={rulesetFor(VERSION)}
    />,
    { language },
  );
}

describe("ReviewFlagHeader", () => {
  it("shows the ruleset chip, one reason sentence per code, completeness and the disclaimer", () => {
    renderHeader();
    const header = screen.getByTestId("review-flag-header");
    expect(within(header).getByRole("heading", { level: 2, name: "Flag for review" })).toBeTruthy();
    expect(screen.getByTestId("ruleset-chip").textContent).toBe(
      `Demo ruleset ${VERSION} · not clinically validated`,
    );
    const sentences = within(screen.getByTestId("flag-summary")).getAllByRole("listitem");
    expect(sentences.map((li) => li.getAttribute("data-reason"))).toEqual(
      snapshot.flag.reasonCodes,
    );
    expect(sentences[0]?.textContent).toBe(
      `Systolic reading at or above the demo threshold configured in ruleset ${VERSION}.`,
    );
    expect(screen.getByTestId("completeness-meter").textContent).toContain(
      "5 of 5 required inputs present",
    );
    expect(screen.getByText("DEMO_RULE_NOT_CLINICALLY_VALIDATED")).toBeTruthy();
    expect(
      screen.getByText("A flag is a prompt for clinician review — it is not a diagnosis."),
    ).toBeTruthy();
    // Every threshold number on screen carries the demo placeholder label.
    for (const text of screen.getAllByText(/demo threshold \d/u)) {
      expect(text.textContent).toContain("demo placeholder value");
    }
    expect(document.body.textContent?.toLowerCase()).not.toMatch(/hypertension|diabetes/u);
  });

  it("the ruleset chip opens the rules dialog with placeholder-labelled values", async () => {
    const user = userEvent.setup();
    renderHeader();
    await user.click(screen.getByTestId("ruleset-chip"));
    const dialog = await screen.findByRole("dialog", { name: `Demo ruleset ${VERSION}` });
    expect(
      within(dialog).getAllByText("DEMO_RULE_NOT_CLINICALLY_VALIDATED").length,
    ).toBeGreaterThan(0);
    expect(within(dialog).getByText("Not approved — demonstration only")).toBeTruthy();
    expect(dialog.querySelectorAll("[data-rule]")).toHaveLength(5);
    expect(within(dialog).getByText("Demo placeholder value: 145 mmHg")).toBeTruthy();
    await user.click(within(dialog).getByRole("button", { name: "Close" }));
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("renders the reason sentences in Kinyarwanda", () => {
    renderHeader("rw");
    expect(
      screen.getByRole("heading", { level: 2, name: "Byagaragajwe ngo bisuzumwe" }),
    ).toBeTruthy();
    expect(screen.getByTestId("ruleset-chip").textContent).toBe(
      `Amategeko y'igerageza ${VERSION} · ntiyemejwe mu buvuzi`,
    );
    const first = within(screen.getByTestId("flag-summary")).getAllByRole("listitem")[0];
    expect(first?.textContent).toContain("Umuvuduko wo hejuru");
    expect(first?.textContent).toContain(VERSION);
  });

  it("a not-evaluable flag says it was routed to a person", () => {
    const missing = { ...inputs, glucoseUnit: null };
    renderHeader("en", {
      ...snapshot,
      inputs: missing,
      flag: evaluateScreening(missing, DEMO_RULESET_V1),
    });
    expect(screen.getByTestId("flag-summary").textContent).toContain("recorded without a unit");
    expect(screen.getByTestId("completeness-meter").textContent).toContain(
      "4 of 5 required inputs present",
    );
    expect(screen.getByTestId("completeness-missing").textContent).toBe("Missing: Glucose unit");
  });
});
