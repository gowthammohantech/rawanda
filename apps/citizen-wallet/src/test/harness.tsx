/** Boots the real wallet shell (AppRoot → Boot → providers) on a memory store for tests. */
import { createI18n, languageStorageKey, type Language } from "@laif/i18n";
import { createWebLanguageStorage } from "@laif/i18n/web";
import { createMemoryStoreAdapter, type StoreAdapter } from "@laif/repositories";
import type { CitizenRepository } from "@laif/repositories/citizen";
import { TEST_SAFE_AREA_METRICS } from "@laif/test-utils/native";
import { render, screen, type RenderResult } from "@testing-library/react";
import { useEffect, type ReactNode } from "react";

import { AppRoot } from "../AppRoot.tsx";
import { APP_ID } from "../config.ts";
import { useCitizenRepo } from "../data/repo.tsx";
import { createAppQueryClient, type ShellServices } from "../services.ts";
import { createAppSession } from "../session.ts";
import { createWalletStore } from "../state/session.ts";
import { createDisplayStore } from "../theme/displayStore.ts";

const captured: { repo: CitizenRepository | null } = { repo: null };

function CaptureRepo() {
  const repo = useCitizenRepo();
  useEffect(() => {
    captured.repo = repo;
  }, [repo]);
  return null;
}

export async function bootServices(): Promise<ShellServices> {
  const i18n = await createI18n({ appId: APP_ID, storage: createWebLanguageStorage(APP_ID) });
  const session = createAppSession(window.localStorage);
  return {
    i18n,
    session,
    wallet: createWalletStore(session, window.localStorage),
    display: createDisplayStore(window.localStorage),
    queryClient: createAppQueryClient(),
  };
}

export type ShellView = RenderResult & {
  services: ShellServices;
  store: StoreAdapter;
  repo: () => CitizenRepository;
};

export async function renderShell(
  children: ReactNode,
  options: {
    store?: StoreAdapter;
    readyTestId?: string;
    /** Simulated network latency off (default); `false` keeps the FaultConfig `latencyMs`. */
    noLatency?: boolean;
    /** UI language at boot (stored preference, like a relaunch); default English. */
    language?: Language;
    /** Runs after boot services exist (e.g. sign a persona in) and before the first render. */
    before?: (services: ShellServices) => void;
  } = {},
): Promise<ShellView> {
  const store = options.store ?? createMemoryStoreAdapter();
  if (options.language !== undefined) {
    window.localStorage.setItem(languageStorageKey(APP_ID), options.language);
  }
  const services = await bootServices();
  options.before?.(services);
  const view = render(
    <AppRoot
      bootstrap={() => Promise.resolve(services)}
      openStore={() => Promise.resolve(store)}
      noLatency={options.noLatency ?? true}
      safeAreaMetrics={TEST_SAFE_AREA_METRICS}
    >
      <CaptureRepo />
      {children}
    </AppRoot>,
  );
  if (options.readyTestId !== undefined) {
    await screen.findAllByTestId(options.readyTestId, {}, { timeout: 10_000 });
  }
  return { ...view, services, store, repo: () => captured.repo! };
}

/** Audit events of one action in the store. */
export async function auditsOf(store: StoreAdapter, action: string) {
  const events = await store.getAll<{ action: string; outcome?: string }>("auditEvents");
  return events.filter((e) => e.action === action);
}
