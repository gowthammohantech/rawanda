/**
 * CLN-04 `CorrectionHistory` (T-06): collapsed by default with a count; the original value is
 * retained (struck through, readable) next to the amended value, reason, author + role,
 * timestamp and version; a just-saved entry opens the disclosure and is highlighted.
 */
import { createSeed, DEMO_PERSONAS, PERSONA_IDS, SEED_ANCHORS } from "@laif/mock-data";
import { renderWithProviders } from "@laif/test-utils/web";
import { applyAmendment, type Screening } from "@laif/domain";
import { screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";

import { CorrectionHistory } from "../CorrectionHistory.tsx";

const AMENDED = createSeed().screenings.find(
  (s) => s.id === SEED_ANCHORS.AMENDED_SCREENING.screeningId,
) as Screening;

describe("CorrectionHistory", () => {
  it("renders nothing without amendments", () => {
    renderWithProviders(<CorrectionHistory screening={{ ...AMENDED, amendments: [] }} />);
    expect(screen.queryByTestId("correction-history")).toBeNull();
  });

  it("AMENDED_SCREENING: original retained, amended value, reason, author and version", async () => {
    const user = userEvent.setup();
    renderWithProviders(<CorrectionHistory screening={AMENDED} />);
    const toggle = screen.getByRole("button", { name: "Show correction history (1)" });
    expect(toggle.getAttribute("aria-expanded")).toBe("false");
    expect(screen.queryByTestId("correction-entry")).toBeNull();

    await user.click(toggle);
    const entry = screen.getByTestId("correction-entry");
    expect(within(entry).getByText("Systolic")).toBeTruthy();
    const original = within(entry).getByTestId("correction-original");
    expect(original.tagName).toBe("DEL");
    expect(original.textContent).toBe("128 mmHg");
    expect(within(entry).getByTestId("correction-amended").textContent).toBe("126 mmHg");
    expect(
      within(entry).getByText("Transcription error: device display showed 126 on re-check."),
    ).toBeTruthy();
    const nurse = DEMO_PERSONAS.find((p) => p.id === PERSONA_IDS.nurseAlpha2);
    expect(within(entry).getByText(`${nurse?.displayName ?? "?"} · Nurse reviewer`)).toBeTruthy();
    expect(within(entry).getByText("v4")).toBeTruthy();
    expect(within(entry).getByText("5 Oct 2026, 10:24")).toBeTruthy();
  });

  it("keeps every original across successive amendments and highlights the new one", () => {
    const second = applyAmendment(AMENDED, {
      id: "amd-new" as Screening["amendments"][number]["id"],
      field: "systolic",
      after: 124,
      reason: "Second re-check with a calibrated cuff.",
      amendedBy: "persona-nurse-alpha2" as Screening["workerId"],
      amendedAt: "2026-10-14T06:00:00.000Z",
    });
    renderWithProviders(<CorrectionHistory screening={second} highlightId="amd-new" />);
    const entries = screen.getAllByTestId("correction-entry");
    expect(entries).toHaveLength(2);
    expect(entries.map((e) => within(e).getByTestId("correction-original").textContent)).toEqual([
      "128 mmHg",
      "126 mmHg",
    ]);
    expect(entries[1]?.getAttribute("data-highlighted")).toBe("true");
    expect(within(entries[1] as HTMLElement).getByText("New")).toBeTruthy();
    expect(within(entries[1] as HTMLElement).getByText("v5")).toBeTruthy();
    // The screening's original fields are untouched.
    expect(second.systolic).toBe(128);
  });
});
