/** Boots the real worker shell (AppRoot → Boot → SessionProvider) on a memory store for tests. */
import { createI18n } from "@laif/i18n";
import { createWebLanguageStorage } from "@laif/i18n/web";
import {
  createMemoryStoreAdapter,
  type CareRepository,
  type StoreAdapter,
} from "@laif/repositories";
import { TEST_SAFE_AREA_METRICS } from "@laif/test-utils/native";
import { render, screen, type RenderResult } from "@testing-library/react";
import { useEffect, type ReactNode } from "react";

import { AppRoot } from "../AppRoot.tsx";
import { APP_ID } from "../config.ts";
import { useRepository } from "../providers.tsx";
import { createAppQueryClient, type ShellServices } from "../services.ts";
import { createSessionStore } from "../session/store.ts";

const captured: { repo: CareRepository | null } = { repo: null };

function CaptureRepo() {
  const repo = useRepository();
  useEffect(() => {
    captured.repo = repo;
  }, [repo]);
  return null;
}

export async function bootServices(): Promise<ShellServices> {
  const i18n = await createI18n({ appId: APP_ID, storage: createWebLanguageStorage(APP_ID) });
  return {
    i18n,
    session: createSessionStore(window.localStorage),
    queryClient: createAppQueryClient(),
  };
}

/** Renders the shell and waits until `readyTestId` is on screen. */
export type ShellView = RenderResult & {
  services: ShellServices;
  store: StoreAdapter;
  repo: () => CareRepository;
};

export async function renderShell(
  children: ReactNode,
  options: { store?: StoreAdapter; readyTestId?: string } = {},
): Promise<ShellView> {
  const store = options.store ?? createMemoryStoreAdapter();
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
  if (options.readyTestId !== undefined) {
    await screen.findAllByTestId(options.readyTestId, {}, { timeout: 10_000 });
  }
  return { ...view, services, store, repo: () => captured.repo! };
}
