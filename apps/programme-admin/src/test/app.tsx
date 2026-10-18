/**
 * Test harness for the admin app: memory-adapter repository (no latency), seeded admin slice,
 * optional fast-path demo sign-in (the same `startAdminSession` the sign-in page uses) and a
 * memory router. Tests that exercise the sign-in UI pass no `signInAs`.
 */
import { createI18n } from "@laif/i18n";
import { createWebLanguageStorage } from "@laif/i18n/web";
import type { AuditEvent, DistrictId } from "@laif/domain";
import {
  createMemoryStoreAdapter,
  type FaultConfigPatch,
  type StoreAdapter,
} from "@laif/repositories";
import { readStoreCollection } from "@laif/test-utils";
import { render, screen } from "@testing-library/react";
import { StrictMode } from "react";
import { createMemoryRouter } from "react-router";

import { App } from "../app/App.tsx";
import { APP_ID } from "../app/config.ts";
import { routes } from "../app/router.tsx";
import { createAppServices, type AppServices } from "../app/services.ts";
import { findAdminPersona } from "../auth/personas.ts";
import { ChartSizeContext } from "../components/charts/ChartFrame.tsx";
import { adminSettingsQuery } from "../features/settings/queries.ts";
import { defaultReportingDistrict, startAdminSession } from "../auth/signIn.ts";

export type BootOptions = {
  path?: string;
  store?: StoreAdapter;
  signInAs?: string;
  reportingDistrictId?: DistrictId | null;
  strict?: boolean;
  /** Waits for this test id after render (default: none). */
  waitFor?: string;
  /** Fixed chart size (jsdom has no layout; `ChartSizeContext`). */
  chartSize?: { width: number; height: number };
  /**
   * ADM-09 `renderWithAdmin`: demo faults applied after sign-in (the threshold in force is
   * loaded first, as it is in a running session) and before the first render.
   */
  faults?: FaultConfigPatch;
  /**
   * Loading-state tests: every repository call waits on a gate (closed at the first render,
   * opened by `BootResult.release()`), so the loading state is observed deterministically.
   */
  latency?: boolean;
  /** Load the threshold in force before rendering (default true, as in a running session). */
  prefetchSettings?: boolean;
};

export async function createTestServices(
  store: StoreAdapter = createMemoryStoreAdapter(),
  options: { sleep?: (ms: number) => Promise<void> } = {},
) {
  const i18n = await createI18n({ appId: APP_ID, storage: createWebLanguageStorage(APP_ID) });
  return options.sleep === undefined
    ? createAppServices({ i18n, store, noLatency: true })
    : createAppServices({ i18n, store, sleep: options.sleep });
}

/** A gate every repository call waits on while closed. */
function createGate() {
  let open = true;
  let waiters: Array<() => void> = [];
  return {
    sleep: () =>
      open ? Promise.resolve() : new Promise<void>((resolve) => void waiters.push(resolve)),
    close: () => {
      open = false;
    },
    release: () => {
      open = true;
      const pending = waiters;
      waiters = [];
      for (const resolve of pending) resolve();
    },
  };
}

export async function signIn(
  services: AppServices,
  personaId: string,
  reportingDistrictId?: DistrictId | null,
) {
  await services.repo.demo.ensureSeeded();
  const persona = findAdminPersona(personaId);
  const grant = (await services.repo.listAccessGrants()).find((g) => g.personaId === personaId);
  if (persona === null || grant === undefined) throw new Error(`no admin persona ${personaId}`);
  return startAdminSession(services, {
    persona,
    grant,
    reportingDistrictId:
      reportingDistrictId === undefined
        ? defaultReportingDistrict(persona, grant)
        : reportingDistrictId,
  });
}

export type BootResult = {
  services: AppServices;
  router: ReturnType<typeof createMemoryRouter>;
  store: StoreAdapter;
  unmount: () => void;
  /** `latency: true`: lets the held repository calls run. */
  release: () => void;
};

export async function bootApp(options: BootOptions = {}): Promise<BootResult> {
  const store = options.store ?? createMemoryStoreAdapter();
  const gate = createGate();
  const services = await createTestServices(
    store,
    options.latency === true ? { sleep: gate.sleep } : {},
  );
  if (options.signInAs !== undefined) {
    await signIn(services, options.signInAs, options.reportingDistrictId);
    if (options.prefetchSettings !== false) {
      await services.queryClient.prefetchQuery(adminSettingsQuery(services.repo));
    }
  }
  if (options.faults !== undefined) {
    await services.repo.demo.ensureSeeded();
    await services.repo.demo.setFaults(options.faults);
  }
  const router = createMemoryRouter(routes, {
    initialEntries: [options.path ?? "/admin/overview"],
  });
  if (options.latency === true) gate.close();
  const app = (
    <ChartSizeContext.Provider value={options.chartSize ?? null}>
      <App services={services} router={router} />
    </ChartSizeContext.Provider>
  );
  const view = render(options.strict === true ? <StrictMode>{app}</StrictMode> : app);
  if (options.waitFor !== undefined) {
    await screen.findByTestId(options.waitFor, {}, { timeout: 10_000 });
  }
  return { unmount: view.unmount, services, router, store, release: gate.release };
}

/** Audit events with the given action (FND-08 `readStoreCollection`), oldest first. */
export async function auditEvents(store: StoreAdapter, action: string): Promise<AuditEvent[]> {
  return (await readStoreCollection<AuditEvent>(store, "auditEvents"))
    .filter((e) => e.action === action)
    .sort((a, b) => (a.occurredAt < b.occurredAt ? -1 : a.occurredAt > b.occurredAt ? 1 : 0));
}

/** ADM-09 alias used by the UX-state inventory (`renderWithAdmin({ persona, faults, path })`). */
export function renderWithAdmin(options: BootOptions & { persona: string }): Promise<BootResult> {
  const { persona, ...rest } = options;
  return bootApp({ ...rest, signInAs: persona });
}
