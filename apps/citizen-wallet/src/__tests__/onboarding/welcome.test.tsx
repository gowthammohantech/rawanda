/** CTZ-02 welcome: DemoBanner, synthetic notice, EN/RW switch re-renders + persists. */
import { enResources, rwResources } from "@laif/i18n";
import { fireEvent, screen, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { AboutDemoScreen } from "../../screens/onboarding/AboutDemoScreen.tsx";
import { WelcomeScreen } from "../../screens/onboarding/WelcomeScreen.tsx";
import { renderShell } from "../../test/harness.tsx";
import { lastHref, resetRouter } from "../../test/router-stub.tsx";

vi.mock("expo-router", () => import("../../test/router-stub.tsx"));

type Onboarding = { title: string; syntheticNotForMedicalUse: string; continue: string };
const EN = enResources.citizen.onboarding;
const RW = (rwResources.citizen as { onboarding: Onboarding }).onboarding;

describe("welcome", () => {
  beforeEach(() => resetRouter());

  it("shows the DemoBanner, the synthetic notice and the language switcher", async () => {
    await renderShell(<WelcomeScreen />, { readyTestId: "welcome-screen" });
    expect(screen.getByText(enResources.demo.banner)).toBeTruthy();
    expect(screen.getByText(EN.title)).toBeTruthy();
    const notice = screen.getByTestId("synthetic-notice");
    expect(within(notice).getByText(EN.syntheticNotForMedicalUse)).toBeTruthy();
    expect(screen.getByTestId("welcome-language-switcher")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: EN.continue }));
    expect(lastHref()).toBe("/persona");
    fireEvent.click(screen.getByRole("button", { name: EN.whatIsThis }));
    expect(lastHref()).toBe("/about-demo");
    fireEvent.click(screen.getByTestId("welcome-demo-tools"));
    expect(lastHref()).toBe("/demo-tools");
    // CTZ-08 task 11: language/text size and help are reachable before a persona is chosen.
    fireEvent.click(screen.getByTestId("welcome-accessibility"));
    expect(lastHref()).toBe("/accessibility");
    fireEvent.click(screen.getByTestId("welcome-support"));
    expect(lastHref()).toBe("/support");
  });

  it("switching to RW re-renders the onboarding copy and persists before any persona", async () => {
    const first = await renderShell(<WelcomeScreen />, { readyTestId: "welcome-screen" });
    const switcher = screen.getByTestId("welcome-language-switcher");
    fireEvent.click(within(switcher).getByRole("radio", { name: "Ikinyarwanda" }));
    expect(await screen.findByText(RW.title)).toBeTruthy();
    expect(screen.getByText(RW.syntheticNotForMedicalUse)).toBeTruthy();
    expect(screen.getByText((rwResources.demo as { banner: string }).banner)).toBeTruthy();
    expect(window.localStorage.getItem("laif.citizen.language")).toBe("rw");
    expect(first.services.session.current()).toBeNull();
    first.unmount();

    // Restart: the stored language is used before any persona is chosen.
    await renderShell(<WelcomeScreen />, { store: first.store, readyTestId: "welcome-screen" });
    expect(screen.getByText(RW.title)).toBeTruthy();
    expect(screen.getByRole("button", { name: RW.continue })).toBeTruthy();
  });

  it("about-demo explains the three points with the PROTOTYPE label", async () => {
    await renderShell(<AboutDemoScreen />, { readyTestId: "about-demo-screen" });
    expect(screen.getByText("PROTOTYPE")).toBeTruthy();
    expect(screen.getByText(EN.about.neverBody)).toBeTruthy();
    expect(screen.getByText(EN.about.contactBody)).toBeTruthy();
  });
});
