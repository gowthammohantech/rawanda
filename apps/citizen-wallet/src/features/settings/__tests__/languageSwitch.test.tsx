/**
 * CTZ-08 language: switching to Ikinyarwanda re-renders at once (no restart) — including a
 * validation error already on screen (errors are stored as keys) — is stored under
 * `laif.citizen.language` (survives relaunch, works offline), is saved to the profile, and a
 * missing RW string falls back to English, never to a raw key.
 */
import { createI18n, languageStorageKey } from "@laif/i18n";
import { createWebLanguageStorage } from "@laif/i18n/web";
import { PERSONA_IDS } from "@laif/mock-data";
import { act, fireEvent, screen, waitFor, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { APP_ID } from "../../../config.ts";
import { auditsOf, renderShell } from "../../../test/harness.tsx";
import { resetRouter } from "../../../test/router-stub.tsx";
import { CallbackScreen } from "../../support/CallbackScreen.tsx";
import { SupportScreen } from "../../support/SupportScreen.tsx";
import { AccessibilityScreen } from "../AccessibilityScreen.tsx";

vi.mock("expo-router", () => import("../../../test/router-stub.tsx"));

const as = (personaId: string) => ({
  before: (s: { session: { switchTo: (id: string) => unknown } }) =>
    void s.session.switchTo(personaId),
});

describe("language switch", () => {
  beforeEach(() => resetRouter(["(app)", "(tabs)", "more", "accessibility"]));

  it("re-translates an on-screen validation error and persists across relaunch", async () => {
    const view = await renderShell(
      <>
        <AccessibilityScreen />
        <CallbackScreen />
      </>,
      { ...as(PERSONA_IDS.citizen2), readyTestId: "callback-form" },
    );
    fireEvent.click(screen.getByTestId("callback-send"));
    expect(screen.getByTestId("error-topic").textContent).toBe(
      "Please choose what your question is about.",
    );

    fireEvent.click(
      within(screen.getByTestId("language-options")).getByRole("radio", { name: "Ikinyarwanda" }),
    );
    await waitFor(() =>
      expect(screen.getByTestId("error-topic").textContent).toBe(
        "Hitamo icyo ikibazo cyawe kivugaho.",
      ),
    );
    // Every visible string follows (no restart).
    expect(screen.getAllByText("Ingano y'inyandiko").length).toBeGreaterThan(0);
    expect(window.localStorage.getItem(languageStorageKey(APP_ID))).toBe("rw");
    await waitFor(async () =>
      expect(await auditsOf(view.store, "citizen.settings.changed")).toHaveLength(1),
    );

    // "Kill + relaunch": a fresh i18n instance reads the stored language.
    const relaunched = await createI18n({
      appId: APP_ID,
      storage: createWebLanguageStorage(APP_ID),
    });
    expect(relaunched.language).toBe("rw");
  });

  it("works with the demo network offline (the preference is local)", async () => {
    const view = await renderShell(<AccessibilityScreen />, {
      ...as(PERSONA_IDS.citizen2),
      readyTestId: "language-options",
    });
    await view.repo().demo.setFaults({ offline: true });
    fireEvent.click(
      within(screen.getByTestId("language-options")).getByRole("radio", { name: "Ikinyarwanda" }),
    );
    await waitFor(() => expect(view.services.i18n.language).toBe("rw"));
    expect(screen.queryByTestId("accessibility-save-error")).toBeNull();
    await view.repo().demo.setFaults({ offline: false });
  });

  it("a missing RW string renders the English fallback, never a raw key", async () => {
    const view = await renderShell(<SupportScreen />, {
      ...as(PERSONA_IDS.citizen2),
      readyTestId: "support-screen",
    });
    await act(async () => {
      view.services.i18n.i18n.removeResourceBundle("rw", "citizen");
      await view.services.i18n.setLanguage("rw");
    });
    await waitFor(() =>
      expect(
        screen.getByText(
          "This app is not for emergencies. If you feel very unwell, go to your nearest health facility now.",
        ),
      ).toBeTruthy(),
    );
    expect(view.container.textContent ?? "").not.toMatch(/citizen:|support\.notEmergency/u);
  });
});
