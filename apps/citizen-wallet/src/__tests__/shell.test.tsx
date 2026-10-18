/**
 * Shell smoke test (FND-11, updated for CTZ-02): the wallet boots on a memory-adapter repository
 * signed OUT (no default persona), every screen carries the DEMONSTRATION banner, demo tools
 * toggle faults and reset the demo, and a storage failure shows an ErrorState. Device
 * behaviour: Maestro (`test:maestro`).
 */
import { enResources } from "@laif/i18n";
import { TEST_SAFE_AREA_METRICS } from "@laif/test-utils/native";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { AppRoot } from "../AppRoot.tsx";
import { EntryRedirect } from "../navigation/EntryRedirect.tsx";
import { DemoToolsScreen } from "../screens/DemoToolsScreen.tsx";
import { WelcomeScreen } from "../screens/onboarding/WelcomeScreen.tsx";
import { bootServices, renderShell } from "../test/harness.tsx";

vi.mock("expo-router", () => import("../test/router-stub.tsx"));

const EN_BANNER = enResources.demo.banner;

describe("citizen-wallet shell", () => {
  it("starts signed out: `/` redirects to the welcome screen", async () => {
    const { services } = await renderShell(<EntryRedirect />, { readyTestId: "redirect" });
    expect(services.session.current()).toBeNull();
    expect(screen.getByTestId("redirect").getAttribute("data-href")).toBe("/welcome");
    expect(window.localStorage.getItem("laif.citizen.persona")).toBeNull();
  });

  it("demo tools: unavailable / 500 toggles reach the FaultConfig; reset restores the seed", async () => {
    const { repo, store } = await renderShell(<DemoToolsScreen />, {
      readyTestId: "demo-tools-screen",
    });
    expect(screen.getByText(EN_BANNER)).toBeTruthy();
    expect(screen.getAllByText("DEMO ONLY").length).toBeGreaterThan(0);
    const seeded = await repo().demo.getDemoState();
    const [patient] = await store.getAll<{ id: string }>("patients");
    await store.delete("patients", patient!.id);

    fireEvent.click(screen.getByRole("switch", { name: "Service unavailable" }));
    await waitFor(async () =>
      expect((await repo().demo.getFaults()).dependencyUnavailableRate).toBe(1),
    );
    fireEvent.click(screen.getByRole("switch", { name: "Server errors (500)" }));
    await waitFor(async () => expect((await repo().demo.getFaults()).serverErrorRate).toBe(1));

    fireEvent.click(screen.getByRole("button", { name: "Advance +1 day" }));
    await screen.findByText(/15 Oct 2026/u);
    fireEvent.click(screen.getByRole("button", { name: "Back to baseline" }));
    await screen.findByText(/14 Oct 2026/u);

    fireEvent.click(screen.getByTestId("demo-reset"));
    await screen.findByText("Reset demo data?");
    const buttons = screen.getAllByRole("button", { name: "Reset demo" });
    fireEvent.click(buttons[buttons.length - 1]!);
    await screen.findByText("Demo data was reset to the baseline.");
    expect((await repo().demo.getDemoState()).datasetHash).toBe(seeded.datasetHash);
    expect((await repo().demo.getFaults()).dependencyUnavailableRate).toBe(0);
  });

  it("shows an ErrorState when the local database cannot be opened", async () => {
    const services = await bootServices();
    render(
      <AppRoot
        bootstrap={() => Promise.resolve(services)}
        openStore={() => Promise.reject(new Error("disk full"))}
        safeAreaMetrics={TEST_SAFE_AREA_METRICS}
      >
        <WelcomeScreen />
      </AppRoot>,
    );
    expect(await screen.findByText("The demo data could not be prepared")).toBeTruthy();
    expect(screen.getByText(EN_BANNER)).toBeTruthy();
  });
});
