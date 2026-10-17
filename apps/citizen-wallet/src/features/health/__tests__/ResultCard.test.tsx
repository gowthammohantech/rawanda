/** CTZ-03: ResultCard chip = icon + text per label; values with units; provenance; a11y name. */
import type { CitizenResultLabel } from "@laif/domain";
import { aReleasedObservation } from "@laif/test-utils";
import { renderNative } from "@laif/test-utils/native";
import { fireEvent, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { ResultCard } from "../ResultCard.tsx";

const CASES: [CitizenResultLabel, string, string, string][] = [
  ["followUpAgreed", "Follow-up agreed", "icon-calendar", "Gukurikiranwa byemejwe"],
  ["noActionNeeded", "No action needed", "icon-check", "Nta gikorwa gikenewe"],
  ["reviewedNoActionNeeded", "Reviewed", "icon-check", "Byasuzumwe"],
];

describe("ResultCard", () => {
  it.each(CASES)("%s → chip text + icon (EN and RW)", (label, en, icon, rw) => {
    const result = aReleasedObservation({ label });
    const view = renderNative(<ResultCard result={result} />, { appId: "citizen" });
    const chip = screen.getByTestId(`result-chip-${label}`);
    expect(chip.textContent).toBe(en);
    expect(within(chip).getByTestId(icon)).toBeTruthy();
    view.unmount();
    renderNative(<ResultCard result={result} />, { appId: "citizen", language: "rw" });
    expect(screen.getByTestId(`result-chip-${label}`).textContent).toBe(rw);
  });

  it("shows values with units, the Kigali date and the reviewer line; opens on press", () => {
    const onPress = vi.fn();
    renderNative(<ResultCard result={aReleasedObservation()} onPress={onPress} />, {
      appId: "citizen",
    });
    const card = screen.getByTestId("result-card-scr-test-1");
    const text = card.textContent ?? "";
    expect(text).toContain("152/96 mmHg");
    expect(text).toContain("7.4 mmol/L");
    expect(text).toContain("11 Oct 2026");
    // Reviewer persona-clin-alpha1 (synthetic name) + released time in Kigali (UTC+2).
    expect(screen.getByTestId("review-provenance").textContent).toMatch(
      /^Reviewed by .+ · 12 Oct 2026, 10:24$/u,
    );
    const label = card.getAttribute("aria-label") ?? "";
    expect(label).toContain("Blood pressure 152 over 96 millimetres of mercury");
    expect(label).toContain("Blood glucose 7.4 millimoles per litre");
    expect(label).toContain("Follow-up agreed");
    fireEvent.click(card);
    expect(onPress).toHaveBeenCalledTimes(1);
  });

  it("a blood-pressure-only result shows no glucose value", () => {
    renderNative(
      <ResultCard
        result={aReleasedObservation({
          readings: {
            systolic: 154,
            diastolic: 89,
            bloodPressureUnit: "mmHg",
            glucoseValue: null,
            glucoseUnit: null,
            glucoseContext: null,
          },
        })}
      />,
      { appId: "citizen" },
    );
    expect(screen.getByText("Blood pressure check")).toBeTruthy();
    expect(screen.queryByTestId("reading-glucose")).toBeNull();
  });
});
