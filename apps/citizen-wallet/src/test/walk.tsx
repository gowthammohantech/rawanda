/**
 * CTZ-09 route-walk helper: renders one route module of `ROUTE_CASES` on the real shell (memory
 * store, seeded) as a persona, with router segments / params, and waits until its data is shown
 * (ready test id present, no loading state left).
 */
import type { Language } from "@laif/i18n";
import type { StoreAdapter } from "@laif/repositories";
import { PERSONA_IDS, SEED_ANCHORS } from "@laif/mock-data";
import { cleanup, screen, waitFor } from "@testing-library/react";
import { expect } from "vitest";

import type { ShellServices } from "../services.ts";
import { renderShell, type ShellView } from "./harness.tsx";
import { personaOf, type RouteCase } from "./routes.tsx";
import { resetRouter } from "./router-stub.tsx";

/** Active patient per persona (the guard sets it in the app; the walk renders leaf routes). */
export const ACTIVE_PATIENT: Readonly<Record<string, string>> = {
  [PERSONA_IDS.citizen1]: SEED_ANCHORS.CTZ_P1_APPOINTMENT_INSTRUCTION.patientId,
  [PERSONA_IDS.citizen2]: SEED_ANCHORS.CTZ_P2_DISMISSED_SCREENING.patientId,
  [PERSONA_IDS.citizenRep]: SEED_ANCHORS.CTZ_P4_REPRESENTED_PATIENT.patientId,
  [PERSONA_IDS.citizenWithdrawn]: SEED_ANCHORS.CTZ_P3_WITHDRAWN_PATIENT.patientId,
};

export const READY_TIMEOUT = { timeout: 10_000 };

export function signIn(services: ShellServices, personaId: string | null): void {
  if (personaId === null) return;
  services.session.switchTo(personaId);
  services.wallet
    .getState()
    .setContext({ accountId: null, activePatientId: ACTIVE_PATIENT[personaId] ?? null });
}

export async function renderRoute(
  route: RouteCase,
  walkPersona: string,
  options: {
    language?: Language;
    before?: (services: ShellServices) => void;
    store?: StoreAdapter;
    noLatency?: boolean;
    /** `false`: return right after boot (assert loading / error states yourself). */
    waitReady?: boolean;
  } = {},
): Promise<ShellView> {
  cleanup();
  window.localStorage.clear();
  resetRouter(route.segments, route.params ?? {});
  const view = await renderShell(<route.Component />, {
    ...(options.language === undefined ? {} : { language: options.language }),
    ...(options.store === undefined ? {} : { store: options.store }),
    ...(options.noLatency === undefined ? {} : { noLatency: options.noLatency }),
    before: (services) => {
      signIn(services, personaOf(route, walkPersona));
      options.before?.(services);
    },
  });
  if (options.waitReady === false) return view;
  await screen.findAllByTestId(route.ready, {}, READY_TIMEOUT);
  await waitFor(
    () => expect(screen.queryAllByTestId("loading-state")).toHaveLength(0),
    READY_TIMEOUT,
  );
  return view;
}

/** Visible text plus every accessible name (screen readers read those too). */
export function renderedText(root: ParentNode = document.body): string {
  const labels = [...root.querySelectorAll("[aria-label]")].map(
    (e) => e.getAttribute("aria-label") ?? "",
  );
  return [root.textContent ?? "", ...labels].join("\n");
}
