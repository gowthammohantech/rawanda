/**
 * FND-11 smoke test (Vitest + react-native-web, FND-10 runner): the wallet shell boots on a
 * memory-adapter repository, renders the tab layout (Expo Router `Tabs` stubbed: it needs the
 * Metro route context), shows the DEMONSTRATION banner on each screen, switches EN → RW with
 * persistence, toggles Offline and resets the demo. Device behaviour: Maestro (`test:maestro`).
 */
import { createI18n, enResources, rwResources } from "@laif/i18n";
import { createWebLanguageStorage } from "@laif/i18n/web";
import { PERSONA_IDS } from "@laif/mock-data";
import { createMemoryStoreAdapter, type StoreAdapter } from "@laif/repositories";
import { TEST_SAFE_AREA_METRICS } from "@laif/test-utils/native";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { useEffect, type ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";

import TabsLayout from "../../app/(tabs)/_layout.tsx";
import { AppRoot } from "../AppRoot.tsx";
import { APP_ID } from "../config.ts";
import { useRepository } from "../providers.tsx";
import { HomeScreen } from "../screens/HomeScreen.tsx";
import { SettingsScreen } from "../screens/SettingsScreen.tsx";
import { createAppQueryClient, type ShellServices } from "../services.ts";
import { createAppSession } from "../session.ts";

vi.mock("expo-router", () => {
  type ScreenProps = {
    name: string;
    options?: { title?: string; tabBarAccessibilityLabel?: string };
  };
  function Tabs({ children }: { children?: ReactNode }) {
    return <nav data-testid="tab-bar">{children}</nav>;
  }
  Tabs.Screen = function TabScreen({ name, options }: ScreenProps) {
    return (
      <button type="button" data-route={name} aria-label={options?.tabBarAccessibilityLabel}>
        {options?.title}
      </button>
    );
  };
  return { Tabs };
});

const EN_BANNER = enResources.demo.banner;
const RW_BANNER = (rwResources.demo as { banner: string }).banner;
const OFFLINE_TEXT = enResources.common.state.offline;

const captured: { repo: ReturnType<typeof useRepository> | null } = { repo: null };
function CaptureRepo() {
  const repo = useRepository();
  useEffect(() => {
    captured.repo = repo;
  }, [repo]);
  return null;
}

async function bootServices(): Promise<ShellServices> {
  const i18n = await createI18n({ appId: APP_ID, storage: createWebLanguageStorage(APP_ID) });
  return {
    i18n,
    session: createAppSession(window.localStorage),
    queryClient: createAppQueryClient(),
  };
}

async function renderShell(children: ReactNode, store: StoreAdapter = createMemoryStoreAdapter()) {
  const services = await bootServices();
  const view = render(
    <AppRoot
      bootstrap={() => Promise.resolve(services)}
      openStore={() => Promise.resolve(store)}
      noLatency
      safeAreaMetrics={TEST_SAFE_AREA_METRICS}
    >
      <CaptureRepo />
      {children}
    </AppRoot>,
  );
  await screen.findAllByTestId("app-header", {}, { timeout: 10_000 });
  return { ...view, services, store, repo: () => captured.repo! };
}

describe("citizen-wallet shell", () => {
  it("renders the tab layout and My health with the banner, role banner and default persona", async () => {
    const { services } = await renderShell(
      <>
        <TabsLayout />
        <HomeScreen />
      </>,
    );
    const tabs = screen.getByTestId("tab-bar");
    expect(within(tabs).getByRole("button", { name: "My health" })).toBeTruthy();
    expect(within(tabs).getByRole("button", { name: "Settings" })).toBeTruthy();
    expect(screen.getByText(EN_BANNER)).toBeTruthy();
    expect(screen.getByText("Built in CTZ-03")).toBeTruthy();
    expect(screen.getByText("Demo role switch — not authentication")).toBeTruthy();
    expect(services.session.current()?.id).toBe(PERSONA_IDS.citizen1);
    expect(window.localStorage.getItem("laif.citizen.persona")).toBe(PERSONA_IDS.citizen1);
    expect(screen.getByTestId("language-switcher")).toBeTruthy();
  });

  it("Settings switches EN → RW, persists it and a restart comes back in RW", async () => {
    const first = await renderShell(
      <>
        <TabsLayout />
        <SettingsScreen />
      </>,
    );
    expect(screen.getByText(EN_BANNER)).toBeTruthy();
    const switcher = screen.getByTestId("settings-language-switcher");
    fireEvent.click(within(switcher).getByRole("radio", { name: "Ikinyarwanda" }));
    await screen.findByText(RW_BANNER);
    expect(window.localStorage.getItem("laif.citizen.language")).toBe("rw");
    const rwTabs = (rwResources.citizen as { tabs: { settings: string } }).tabs;
    expect(
      await within(screen.getByTestId("tab-bar")).findByRole("button", { name: rwTabs.settings }),
    ).toBeTruthy();
    first.unmount();

    await renderShell(<HomeScreen />, first.store);
    expect(screen.getByText(RW_BANNER)).toBeTruthy();
  });

  it("Offline shows the OfflineBanner at once; Reset demo restores the seed", async () => {
    const { repo, store } = await renderShell(
      <>
        <SettingsScreen />
      </>,
    );
    const seeded = await repo().demo.getDemoState();
    const [patient] = await store.getAll<{ id: string }>("patients");
    await store.delete("patients", patient!.id);
    expect((await repo().demo.getDemoState()).datasetHash).not.toBe(seeded.datasetHash);

    fireEvent.click(screen.getByRole("button", { name: "Open demo tools" }));
    fireEvent.click(await screen.findByRole("switch", { name: "Offline" }));
    expect(screen.getByText(OFFLINE_TEXT)).toBeTruthy();
    await waitFor(async () => expect((await repo().demo.getFaults()).offline).toBe(true));

    fireEvent.click(screen.getAllByRole("button", { name: "Reset demo" })[0]!);
    expect(await screen.findByText("Reset demo data?")).toBeTruthy();
    const buttons = screen.getAllByRole("button", { name: "Reset demo" });
    fireEvent.click(buttons[buttons.length - 1]!);
    await screen.findByText("Demo data was reset to the baseline.");

    expect((await repo().demo.getDemoState()).datasetHash).toBe(seeded.datasetHash);
    expect((await repo().demo.getFaults()).offline).toBe(false);
    await waitFor(() => expect(screen.queryByText(OFFLINE_TEXT)).toBeNull());
  });

  it("shows an ErrorState when the local database cannot be opened", async () => {
    const services = await bootServices();
    render(
      <AppRoot
        bootstrap={() => Promise.resolve(services)}
        openStore={() => Promise.reject(new Error("disk full"))}
        safeAreaMetrics={TEST_SAFE_AREA_METRICS}
      >
        <HomeScreen />
      </AppRoot>,
    );
    expect(await screen.findByText("The demo data could not be prepared")).toBeTruthy();
    expect(screen.getByText(EN_BANNER)).toBeTruthy();
  });
});
