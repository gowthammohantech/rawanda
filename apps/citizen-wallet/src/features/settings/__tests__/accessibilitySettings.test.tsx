/**
 * CTZ-08 accessibility settings: a change applies at once and is saved to `ctz_settings`
 * (+ `citizen.settings.changed`); a server error reverts it with an inline error and Retry
 * (same key → one write); a conflict reloads the saved values; without a persona the change
 * stays on this phone only (nothing written).
 */
import { PERSONA_IDS } from "@laif/mock-data";
import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { auditsOf, renderShell, type ShellView } from "../../../test/harness.tsx";
import { resetRouter } from "../../../test/router-stub.tsx";
import { AccessibilityScreen } from "../AccessibilityScreen.tsx";

vi.mock("expo-router", () => import("../../../test/router-stub.tsx"));

const T = { timeout: 10_000 };
const as = (personaId: string) => ({
  before: (s: { session: { switchTo: (id: string) => unknown } }) =>
    void s.session.switchTo(personaId),
});

type Settings = { personaId: string; textScale: number; highContrast: boolean; version: number };
const settingsOf = async (view: ShellView, personaId: string) =>
  (await view.store.getAll<Settings>("citizenSettings")).find((s) => s.personaId === personaId);

async function open(personaId: string | null = PERSONA_IDS.citizen2) {
  const view = await renderShell(<AccessibilityScreen />, personaId === null ? {} : as(personaId));
  await screen.findByTestId("text-scale-options", {}, T);
  return view;
}

describe("accessibility settings", () => {
  beforeEach(() => resetRouter(["(app)", "(tabs)", "more", "accessibility"]));

  it("shows the current values, low-data statement and saves a change (audited)", async () => {
    const view = await open();
    expect(screen.getByRole("radio", { name: "Standard" }).getAttribute("aria-checked")).toBe(
      "true",
    );
    expect(
      within(screen.getByTestId("language-options")).getByRole("radio", { name: "English" }),
    ).toBeTruthy();
    expect(
      within(screen.getByTestId("language-options")).getByRole("radio", { name: "Ikinyarwanda" }),
    ).toBeTruthy();
    expect(
      screen.getByText(
        "This demo works without internet. It does not download pictures or videos.",
      ),
    ).toBeTruthy();

    fireEvent.click(screen.getByRole("radio", { name: "Largest" }));
    expect(view.services.display.getState().textScale).toBe(1.5);
    await waitFor(async () =>
      expect((await settingsOf(view, PERSONA_IDS.citizen2))?.textScale).toBe(1.5),
    );
    expect(await auditsOf(view.store, "citizen.settings.changed")).toHaveLength(1);
    expect(await screen.findByText("Saved", {}, T)).toBeTruthy();

    // The preview text is rendered at the chosen size.
    const preview = screen.getByTestId("text-scale-preview-body");
    expect(parseFloat(getComputedStyle(preview).fontSize)).toBeCloseTo(15 * 1.5, 1);

    fireEvent.click(screen.getByRole("switch", { name: "High contrast" }));
    await waitFor(async () =>
      expect((await settingsOf(view, PERSONA_IDS.citizen2))?.highContrast).toBe(true),
    );
    expect(view.services.display.getState().highContrast).toBe(true);
    expect(await auditsOf(view.store, "citizen.settings.changed")).toHaveLength(2);
  });

  it("server error → reverts on this phone, inline error; Retry (same key) saves once", async () => {
    const view = await open();
    await view.repo().demo.setFaults({ serverErrorRate: 1 });
    fireEvent.click(screen.getByRole("radio", { name: "Larger" }));
    expect(await screen.findByTestId("accessibility-save-error", {}, T)).toBeTruthy();
    expect(view.services.display.getState().textScale).toBe(1);
    expect((await settingsOf(view, PERSONA_IDS.citizen2))?.textScale).toBe(1);

    await view.repo().demo.setFaults({ serverErrorRate: 0 });
    fireEvent.click(screen.getByTestId("accessibility-retry"));
    await waitFor(async () =>
      expect((await settingsOf(view, PERSONA_IDS.citizen2))?.textScale).toBe(1.3),
    );
    expect(view.services.display.getState().textScale).toBe(1.3);
    expect(screen.queryByTestId("accessibility-save-error")).toBeNull();
    expect(await auditsOf(view.store, "citizen.settings.changed")).toHaveLength(1);
  });

  it("conflict (changed elsewhere) → saved values reloaded + toast", async () => {
    const view = await open();
    await waitFor(() => expect(screen.getByRole("radio", { name: "Standard" })).toBeTruthy());
    // Another device saves "high contrast on" first (the screen still holds the old version).
    const before = await settingsOf(view, PERSONA_IDS.citizen2);
    await view
      .repo()
      .updateSettings(
        { highContrast: true, expectedVersion: before!.version },
        crypto.randomUUID(),
      );
    fireEvent.click(screen.getByRole("radio", { name: "Large" }));
    expect(
      await screen.findByText(
        "Your settings were changed somewhere else. We loaded your saved settings.",
        {},
        T,
      ),
    ).toBeTruthy();
    await waitFor(() => expect(view.services.display.getState().highContrast).toBe(true));
    expect(view.services.display.getState().textScale).toBe(1);
    expect((await settingsOf(view, PERSONA_IDS.citizen2))?.textScale).toBe(1);
  });

  it("before a persona is chosen: device only, nothing written", async () => {
    const view = await open(null);
    expect(screen.getByTestId("accessibility-device-only")).toBeTruthy();
    fireEvent.click(screen.getByRole("radio", { name: "Larger" }));
    expect(view.services.display.getState().textScale).toBe(1.3);
    expect(await auditsOf(view.store, "citizen.settings.changed")).toHaveLength(0);
  });
});
