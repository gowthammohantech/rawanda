/**
 * Test harness: boots the real App (providers, Boot seeding, router) on a memory-adapter
 * repository without latency, a memory router and the jsdom localStorage session.
 */
import type { AuditEvent } from "@laif/domain";
import { createI18n } from "@laif/i18n";
import { createWebLanguageStorage } from "@laif/i18n/web";
import { createMemoryStoreAdapter, type StoreAdapter } from "@laif/repositories";
import { render, screen, waitFor, type RenderResult } from "@testing-library/react";
import { StrictMode } from "react";
import { createMemoryRouter } from "react-router";
import { expect } from "vitest";

import { App } from "../app/App.tsx";
import { APP_ID } from "../app/config.ts";
import { createAppRepository } from "../data/repository.ts";
import { appRoutes } from "../app/router.tsx";
import { createAppQueryClient, type AppServices } from "../app/services.ts";
import { createAppSession } from "../session/session-store.ts";

export type RenderAppOptions = {
  path?: string;
  store?: StoreAdapter;
  /** Signs in before the first render (the "fast path"). */
  signIn?: { personaId: string; facilityId: string };
  /** Render inside StrictMode like `main.tsx` (default true). */
  strict?: boolean;
};

export type RenderedApp = RenderResult & {
  services: AppServices;
  router: ReturnType<typeof createMemoryRouter>;
  store: StoreAdapter;
};

export async function renderApp(options: RenderAppOptions = {}): Promise<RenderedApp> {
  const {
    path = "/clinical/login",
    store = createMemoryStoreAdapter(),
    signIn,
    strict = true,
  } = options;
  const i18n = await createI18n({ appId: APP_ID, storage: createWebLanguageStorage(APP_ID) });
  const session = createAppSession();
  if (signIn !== undefined) {
    const result = session.signIn(signIn.personaId, signIn.facilityId);
    if (!result.ok) throw new Error(`test sign-in failed: ${result.reason}`);
  }
  const services: AppServices = {
    i18n,
    session,
    repo: createAppRepository({ session, store, noLatency: true }),
    queryClient: createAppQueryClient({ retryDelayMs: 0 }),
  };
  const router = createMemoryRouter(appRoutes, { initialEntries: [path] });
  const app = <App services={services} router={router} />;
  const view = render(strict ? <StrictMode>{app}</StrictMode> : app);
  await waitFor(
    () =>
      expect(
        screen.queryByTestId("app-shell") ??
          screen.queryByTestId("public-shell") ??
          screen.queryByRole("alert"),
      ).not.toBeNull(),
    { timeout: 10_000 },
  );
  return { ...view, services, router, store };
}

/** Audit events with `action` (read straight from the memory store). */
export async function auditEvents(store: StoreAdapter, action: string) {
  const all = await store.getAll<AuditEvent>("auditEvents");
  return all.filter((event) => event.action === action);
}
