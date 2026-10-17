/**
 * CLN-06 shared ConflictPanel: "Your version" vs "Latest version" rows, the CONFLICT pill, who
 * changed it (demo persona name) and only two actions — reload latest (`keep_latest`) and Cancel;
 * no "re-apply" action, so nothing is silently overwritten.
 */
import type { ConflictDetails } from "@laif/contracts";
import { PERSONA_IDS } from "@laif/mock-data";
import { renderWithProviders } from "@laif/test-utils/web";
import { screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { ConflictPanel } from "../ConflictPanel.tsx";

const conflict: ConflictDetails<unknown> = {
  entityType: "review",
  entityId: "rev-1",
  expectedVersion: 1,
  currentVersion: 2,
  latest: { status: "in_review" },
  changedBy: PERSONA_IDS.nurseAlpha2,
  changedAt: "2026-10-14T06:00:00.000Z",
};

describe("ConflictPanel", () => {
  it("compares versions and offers reload latest + cancel only", async () => {
    const user = userEvent.setup();
    const onReload = vi.fn();
    const onCancel = vi.fn();
    renderWithProviders(
      <ConflictPanel
        conflict={conflict}
        title="Another clinician changed this review"
        rows={[{ id: "status", label: "Status", yours: "Pending", latest: "In review" }]}
        onReload={onReload}
        onCancel={onCancel}
      />,
    );
    const panel = screen.getByTestId("conflict-panel");
    expect(panel.getAttribute("role")).toBe("alert");
    expect(within(panel).getByText("Another clinician changed this review")).toBeTruthy();
    expect(within(panel).getByText("Your version")).toBeTruthy();
    expect(within(panel).getByText("Latest version")).toBeTruthy();
    expect(within(panel).getByText("Conflict")).toBeTruthy();
    expect(panel.textContent).toContain("Changed by Quilra Xabezo");
    expect(panel.textContent).toContain("14 Oct 2026, 08:00");
    expect(panel.querySelector("[data-changed]")).not.toBeNull();

    const buttons = within(panel).getAllByRole("button");
    expect(buttons.map((b) => b.textContent)).toEqual(["Keep the latest version", "Cancel"]);
    await user.click(buttons[0] as HTMLElement);
    expect(onReload).toHaveBeenCalledTimes(1);
    await user.click(buttons[1] as HTMLElement);
    expect(onCancel).toHaveBeenCalledTimes(1);
  });

  it("disables both actions while reloading", () => {
    renderWithProviders(
      <ConflictPanel
        conflict={conflict}
        rows={[]}
        reloading
        onReload={() => undefined}
        onCancel={() => undefined}
      />,
    );
    for (const button of within(screen.getByTestId("conflict-panel")).getAllByRole("button")) {
      expect((button as HTMLButtonElement).disabled).toBe(true);
    }
    expect(screen.getByText("Someone else changed this record")).toBeTruthy();
  });
});
