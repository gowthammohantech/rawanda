/**
 * Worker shell (FND-11 smoke + HWM-01 flow) under Vitest + react-native-web: cold start without a
 * session → sign-in; persona → scope → signed in → Today; restart keeps the session; the five
 * tabs; supervisor facility choice; forced out-of-scope sign-in → denied + `access.denied`;
 * Settings (language, device id, sign out keeps data, demo tools); DB failure. Expo Router is
 * stubbed (`src/test/router-stub.tsx`); device routing is proven by Maestro.
 */
import type { AuditEvent, DeviceSession } from "@laif/domain";
import { enResources, rwResources } from "@laif/i18n";
import { FACILITY_IDS, PERSONA_IDS, SEED_ANCHORS } from "@laif/mock-data";
import { TEST_SAFE_AREA_METRICS } from "@laif/test-utils/native";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { useState } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import AppLayout from "../../app/(app)/_layout.tsx";
import TabsLayout from "../../app/(app)/(tabs)/_layout.tsx";
import TodayTab from "../../app/(app)/(tabs)/index.tsx";
import AuthLayout from "../../app/(auth)/_layout.tsx";
import { AppRoot } from "../AppRoot.tsx";
import { DeniedScreen } from "../features/auth/DeniedScreen.tsx";
import { ScopeScreen } from "../features/auth/ScopeScreen.tsx";
import { SignInScreen } from "../features/auth/SignInScreen.tsx";
import { SettingsScreen } from "../features/settings/SettingsScreen.tsx";
import { shortDeviceId } from "../session/device.ts";
import { DEVICE_SESSION_STORAGE_KEY } from "../session/store.ts";
import { useSession } from "../session/useSession.ts";
import { routerLog, segments } from "../test/router-stub.tsx";
import { bootServices, renderShell } from "../test/shell-harness.tsx";

vi.mock("expo-router", () => import("../test/router-stub.tsx"));

const EN_BANNER = enResources.demo.banner;
const RW_BANNER = (rwResources.demo as { banner: string }).banner;
const RW_NAV = (rwResources.worker as { nav: Record<string, string> }).nav;
const OFFLINE_TEXT = enResources.common.state.offline;
const WORKER_PERSONA_COUNT = 5;

/** Mini router: the same decisions as the route layouts, without Metro. */
function Flow({ showTestHook = false }: { showTestHook?: boolean }) {
  const { status } = useSession();
  const [personaId, setPersonaId] = useState<string | null>(null);
  const [denied, setDenied] = useState(false);
  if (denied) return <DeniedScreen onBack={() => setDenied(false)} />;
  if (status === "signed_in") {
    return (
      <>
        <TabsLayout />
        <TodayTab />
      </>
    );
  }
  if (personaId !== null) {
    return (
      <ScopeScreen
        personaId={personaId}
        showTestHook={showTestHook}
        onBack={() => setPersonaId(null)}
        onSignedIn={() => undefined}
        onDenied={() => setDenied(true)}
      />
    );
  }
  return <SignInScreen onPersonaChosen={setPersonaId} />;
}

function pickPersona(personaId: string) {
  fireEvent.click(screen.getByTestId(`persona-card-${personaId}`));
  fireEvent.click(screen.getByTestId("persona-continue"));
}

beforeEach(() => {
  routerLog.length = 0;
  segments.current = [];
});

describe("worker-mobile shell (HWM-01)", () => {
  it("cold start without a session shows the demo sign-in (worker personas only, DEMO SIGN-IN each)", async () => {
    await renderShell(
      <>
        <AppLayout />
        <SignInScreen onPersonaChosen={() => undefined} />
      </>,
      { readyTestId: "sign-in-screen" },
    );
    expect(screen.getByTestId("redirect").getAttribute("data-href")).toBe("/sign-in");
    expect(screen.getByText(EN_BANNER)).toBeTruthy();
    expect(screen.getByTestId("language-switcher")).toBeTruthy();
    expect(screen.getByText("Demo sign-in — not real authentication")).toBeTruthy();
    const cards = within(screen.getByTestId("persona-picker")).getAllByRole("radio");
    expect(cards).toHaveLength(WORKER_PERSONA_COUNT);
    expect(screen.getAllByText("Demo sign-in")).toHaveLength(WORKER_PERSONA_COUNT);
    expect(screen.queryByTestId(`persona-card-${PERSONA_IDS.clinAlpha1}`)).toBeNull();
    expect(screen.getByTestId(`persona-card-${PERSONA_IDS.supAlpha}`)).toBeTruthy();
    expect(window.localStorage.getItem("laif.worker.persona")).toBeNull();
  });

  it("persona → scope → signed in → Today; a restart is still signed in", async () => {
    const first = await renderShell(<Flow />, { readyTestId: "sign-in-screen" });
    pickPersona(PERSONA_IDS.chwAlpha1A);
    expect(await screen.findByTestId("scope-screen")).toBeTruthy();
    expect(screen.getByText(EN_BANNER)).toBeTruthy();
    expect(screen.getByTestId("language-switcher")).toBeTruthy();
    expect(screen.getByTestId("scope-district").textContent).toBe("Demo District Alpha");
    expect(screen.getByTestId("scope-facility").textContent).toBe("Demo Health Centre Alpha-1");
    fireEvent.click(screen.getByTestId("scope-continue"));
    expect(await screen.findByTestId("today-screen")).toBeTruthy();
    expect(await screen.findByText("Signed in to Demo Health Centre Alpha-1")).toBeTruthy();
    expect(screen.getByText(EN_BANNER)).toBeTruthy();
    expect(within(screen.getByTestId("app-header")).getByText("Demo Health Centre Alpha-1"));
    expect(screen.getByTestId("network-badge")).toBeTruthy();
    // The visible "Signed in to …" toast follows a language switch (HWM-03 gap, fixed in HWM-04).
    const switcher = () => within(screen.getAllByTestId("language-switcher")[0]!);
    fireEvent.click(switcher().getByRole("radio", { name: "Ikinyarwanda" }));
    expect(await screen.findByText(/^Winjiye muri /)).toBeTruthy();
    expect(screen.queryByText("Signed in to Demo Health Centre Alpha-1")).toBeNull();
    fireEvent.click(switcher().getByRole("radio", { name: "English" }));
    expect(await screen.findByText("Signed in to Demo Health Centre Alpha-1")).toBeTruthy();

    const sessions = await first.store.getAll<DeviceSession>("deviceSessions");
    expect(sessions).toHaveLength(1);
    expect(sessions[0]).toMatchObject({ personaId: PERSONA_IDS.chwAlpha1A, status: "active" });
    const started = (await first.store.getAll<AuditEvent>("auditEvents")).filter(
      (e) => e.action === "session.started",
    );
    expect(started).toHaveLength(1);
    first.unmount();

    segments.current = ["(app)", "(tabs)"];
    await renderShell(
      <>
        <AppLayout />
        <Flow />
      </>,
      { store: first.store, readyTestId: "today-screen" },
    );
    expect(screen.queryByTestId("redirect")).toBeNull();
    expect(screen.getByTestId("stack")).toBeTruthy();
  });

  it("five tabs with labels and accessibility labels in the active language, ≥ 44 pt targets", async () => {
    await renderShell(<Flow />, { readyTestId: "sign-in-screen" });
    pickPersona(PERSONA_IDS.chwAlpha1B);
    fireEvent.click(await screen.findByTestId("scope-continue"));
    const tabs = await screen.findByTestId("tab-bar");
    for (const name of ["Today", "Find", "Screen", "Tasks", "Sync"]) {
      expect(within(tabs).getByRole("button", { name })).toBeTruthy();
    }
    expect(Number(tabs.getAttribute("data-min-height"))).toBeGreaterThanOrEqual(44);
    expect(Number(tabs.getAttribute("data-min-width"))).toBeGreaterThanOrEqual(44);

    fireEvent.click(
      within(screen.getByTestId("language-switcher")).getByRole("radio", { name: "Ikinyarwanda" }),
    );
    await screen.findByText(RW_BANNER);
    await waitFor(() => {
      const labels = within(screen.getByTestId("tab-bar"))
        .getAllByRole("button")
        .map((b) => b.getAttribute("aria-label"));
      expect(labels).toEqual(["today", "find", "screen", "tasks", "sync"].map((k) => RW_NAV[k]));
    });
    expect(window.localStorage.getItem("laif.worker.language")).toBe("rw");
  }, 20_000);

  it("supervisor must choose one of the assigned facilities before Continue", async () => {
    const { store } = await renderShell(<Flow />, { readyTestId: "sign-in-screen" });
    pickPersona(PERSONA_IDS.supAlpha);
    const continueButton = await screen.findByTestId("scope-continue");
    expect(continueButton.getAttribute("aria-disabled")).toBe("true");
    expect(screen.getByTestId("scope-facility-hint")).toBeTruthy();
    const choice = screen.getByTestId("scope-facility-choice");
    expect(within(choice).getAllByRole("radio")).toHaveLength(2);
    fireEvent.click(within(choice).getByRole("radio", { name: "Demo Health Centre Alpha-2" }));
    expect(screen.queryByTestId("scope-facility-hint")).toBeNull();
    fireEvent.click(screen.getByTestId("scope-continue"));
    expect(await screen.findByTestId("today-screen")).toBeTruthy();
    const [session] = await store.getAll<DeviceSession>("deviceSessions");
    expect(session?.facilityId).toBe(FACILITY_IDS.alpha2);
  });

  it("forcing a facility outside the assignment → FORBIDDEN, denied screen, access.denied audit", async () => {
    const { store } = await renderShell(<Flow showTestHook />, { readyTestId: "sign-in-screen" });
    pickPersona(PERSONA_IDS.chwAlpha1A);
    fireEvent.click(await screen.findByTestId("scope-test-hook"));
    expect(await screen.findByTestId("denied-screen")).toBeTruthy();
    expect(screen.getByTestId("access-denied-label").textContent).toBe("Access denied");
    expect(screen.getByRole("button", { name: "Back to sign-in" })).toBeTruthy();
    expect(screen.getByText(EN_BANNER)).toBeTruthy();
    const denied = (await store.getAll<AuditEvent>("auditEvents")).filter(
      (e) => e.action === "access.denied" && e.changeSummary !== null,
    );
    expect(denied.at(-1)).toMatchObject({
      actorId: PERSONA_IDS.chwAlpha1A,
      outcome: "denied",
      entityId: FACILITY_IDS.alpha2,
    });
    expect(await store.getAll("deviceSessions")).toHaveLength(0);
    expect(window.localStorage.getItem(DEVICE_SESSION_STORAGE_KEY)).toBeNull();
  });

  it("Settings shows the signed-in context and device id; sign out keeps every other record", async () => {
    const view = await renderShell(<Flow />, { readyTestId: "sign-in-screen" });
    pickPersona(PERSONA_IDS.chwAlpha1A);
    fireEvent.click(await screen.findByTestId("scope-continue"));
    await screen.findByTestId("today-screen");
    view.unmount();

    const onSignedOut = vi.fn();
    const { store, repo } = await renderShell(
      <>
        <AppLayout />
        <SettingsScreen onSignedOut={onSignedOut} onOpenNetwork={() => undefined} />
      </>,
      { store: view.store, readyTestId: "settings-screen" },
    );
    const deviceId = await repo().device.getOrCreateDeviceId();
    const details = screen.getByTestId("signed-in-details");
    expect(within(details).getByText(shortDeviceId(deviceId))).toBeTruthy();
    expect(within(details).getByText("Oxavel Oquumbra")).toBeTruthy();
    expect(within(details).getByText("Demo Health Centre Alpha-1")).toBeTruthy();
    expect(screen.getByText(EN_BANNER)).toBeTruthy();
    expect(screen.getByTestId("settings-language-switcher")).toBeTruthy();

    const keep = ["patients", "screenings", "followUps", "syncOperations", "referrals"] as const;
    const before = await Promise.all(keep.map((c) => store.getAll(c)));
    fireEvent.click(screen.getByTestId("sign-out"));
    expect(await screen.findByText("Unsynced items stay on this device.")).toBeTruthy();
    const buttons = screen.getAllByRole("button", { name: "Sign out" });
    fireEvent.click(buttons[buttons.length - 1]!);
    await waitFor(() => expect(onSignedOut).toHaveBeenCalled());
    expect(await screen.findByTestId("redirect")).toBeTruthy();
    expect(screen.getByTestId("redirect").getAttribute("data-href")).toBe("/sign-in");

    expect(await Promise.all(keep.map((c) => store.getAll(c)))).toEqual(before);
    const [session] = await store.getAll<DeviceSession>("deviceSessions");
    expect(session?.status).toBe("ended");
    expect(window.localStorage.getItem("laif.worker.persona")).toBeNull();
    expect(await repo().device.getOrCreateDeviceId()).toBe(deviceId);
  });

  it("AuthLayout renders the auth stack signed out and sends a signed-in user to the tabs", async () => {
    await renderShell(
      <>
        <AuthLayout />
        <Flow />
      </>,
      { readyTestId: "sign-in-screen" },
    );
    expect(screen.getByTestId("stack")).toBeTruthy();
    pickPersona(PERSONA_IDS.chwAlpha2A);
    fireEvent.click(await screen.findByTestId("scope-continue"));
    await screen.findByTestId("today-screen");
    expect(screen.getByTestId("redirect").getAttribute("data-href")).toBe("/");
  });

  it("Offline shows the OfflineBanner at once; Reset demo restores the seed and signs out", async () => {
    const first = await renderShell(<Flow />, { readyTestId: "sign-in-screen" });
    pickPersona(PERSONA_IDS.chwAlpha1A);
    fireEvent.click(await screen.findByTestId("scope-continue"));
    await screen.findByTestId("today-screen");
    first.unmount();

    const { repo, store } = await renderShell(
      <>
        <AppLayout />
        <SettingsScreen onSignedOut={() => undefined} onOpenNetwork={() => undefined} />
      </>,
      { store: first.store, readyTestId: "settings-screen" },
    );
    const patientId = SEED_ANCHORS.WF01_FLAGGED_REVIEW.patientId;
    await store.delete("patients", patientId);

    fireEvent.click(screen.getByRole("button", { name: "Open demo tools" }));
    fireEvent.click(await screen.findByRole("switch", { name: "Offline" }));
    expect(screen.getByText(OFFLINE_TEXT)).toBeTruthy();
    await waitFor(async () => expect((await repo().demo.getFaults()).offline).toBe(true));

    fireEvent.click(screen.getAllByRole("button", { name: "Reset demo" })[0]!);
    expect(await screen.findByText("Reset demo data?")).toBeTruthy();
    const buttons = screen.getAllByRole("button", { name: "Reset demo" });
    fireEvent.click(buttons[buttons.length - 1]!);
    await screen.findByText("Demo data restored");

    expect(await store.get("patients", patientId)).toBeDefined();
    expect(await store.getAll("deviceSessions")).toHaveLength(0);
    expect((await repo().demo.getFaults()).offline).toBe(false);
    // The reset clears device sessions + the device id: the worker signs in again.
    await waitFor(() =>
      expect(screen.getByTestId("redirect").getAttribute("data-href")).toBe("/sign-in"),
    );
  });

  it("shows an ErrorState when the local database cannot be opened", async () => {
    const services = await bootServices();
    render(
      <AppRoot
        bootstrap={() => Promise.resolve(services)}
        openStore={() => Promise.reject(new Error("disk full"))}
        safeAreaMetrics={TEST_SAFE_AREA_METRICS}
      >
        <SignInScreen onPersonaChosen={() => undefined} />
      </AppRoot>,
    );
    expect(await screen.findByText("The demo data could not be prepared")).toBeTruthy();
    expect(screen.getByText(EN_BANNER)).toBeTruthy();
  });
});
