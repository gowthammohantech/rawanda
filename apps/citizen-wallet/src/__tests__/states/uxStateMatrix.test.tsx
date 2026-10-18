/**
 * CTZ-09 task 7 — UX-state matrix: every async screen × {loading, loaded, empty, error500,
 * denied, conflict, success, offline}. Each cell is either a scenario run against the real
 * shell (memory store seeded with the citizen slice; faults through the FND-07 injector) or an
 * explicit, reasoned N/A. The table itself is checked to be complete.
 *
 * - loading: the store's FaultConfig `latencyMs` (simulated network) is kept → skeleton first.
 * - error500: FaultConfig `serverErrorRate = 1` → ErrorState; faults off + Retry → loaded (T-09).
 * - denied: consent withdrawn (CTZ-P3) → the route guard redirects to `/consent-withdrawn` with
 *   one `access.denied`; detail routes: a cross-patient deep link (CTZ-P4 → CTZ-P1's id).
 * - offline: N/A — the wallet is local-only (README, About demo "Works without internet"); one
 *   test walks every route and runs the writes with `global.fetch` spied: never called.
 */
import { createMemoryStorage } from "@laif/auth-demo";
import { PERSONA_IDS, SEED_ANCHORS } from "@laif/mock-data";
import { createMemoryStoreAdapter, type StoreAdapter } from "@laif/repositories";
import { act, fireEvent, screen, waitFor, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { createAppRepository, type CitizenRepository } from "../../data/repo.tsx";
import { AppGuard } from "../../navigation/AppGuard.tsx";
import { createAppSession } from "../../session.ts";
import { auditsOf, renderShell, type ShellView } from "../../test/harness.tsx";
import { resetRouter } from "../../test/router-stub.tsx";
import {
  P1_REQUEST_ID,
  P1_RESULT_ID,
  P1_STEP_ID,
  ROUTE_CASES,
  routesFor,
  type RouteCase,
} from "../../test/routes.tsx";
import { ACTIVE_PATIENT, renderRoute } from "../../test/walk.tsx";

vi.mock("expo-router", () => import("../../test/router-stub.tsx"));

const P1 = PERSONA_IDS.citizen1;
const P2 = PERSONA_IDS.citizen2;
const P4 = PERSONA_IDS.citizenRep;
const P1_PATIENT = ACTIVE_PATIENT[P1]!;
const LONG = { timeout: 10_000 };

const STATES = [
  "loading",
  "loaded",
  "empty",
  "error500",
  "denied",
  "conflict",
  "success",
  "offline",
] as const;
type UxState = (typeof STATES)[number];

type Scenario = () => Promise<void>;
type Cell = Scenario | { na: string };

const OFFLINE_NA = {
  na: "local-only app: no network — asserted by the global.fetch spy test below",
};
const READ_ONLY = { na: "read-only screen: no write" };

function routeOf(name: string, overrides: Partial<RouteCase> = {}): RouteCase {
  const found = ROUTE_CASES.find((r) => r.route === name);
  if (found === undefined) throw new Error(`unknown route ${name}`);
  return { ...found, ...overrides };
}

/** A seeded memory store prepared as `personaId` (faults / deletions persist in the store). */
async function prepareStore(
  personaId: string,
  prepare: (repo: CitizenRepository, store: StoreAdapter) => Promise<void>,
): Promise<StoreAdapter> {
  const store = createMemoryStoreAdapter();
  const session = createAppSession(createMemoryStorage());
  session.switchTo(personaId);
  const repo = createAppRepository({ session, store, noLatency: true });
  await repo.demo.ensureSeeded();
  await prepare(repo, store);
  return store;
}

async function deleteWhere(
  store: StoreAdapter,
  collection: Parameters<StoreAdapter["getAll"]>[0],
  match: (row: Record<string, unknown>) => boolean,
) {
  for (const row of await store.getAll<Record<string, unknown> & { id: string }>(collection)) {
    if (match(row)) await store.delete(collection, row.id);
  }
}

// ── Scenario factories ─────────────────────────────────────────────────────

function loading(name: string, persona = P1, overrides: Partial<RouteCase> = {}): Scenario {
  return async () => {
    const route = routeOf(name, overrides);
    const store = await prepareStore(persona, async (repo) => {
      await repo.demo.setFaults({ latencyMs: [400, 400] });
    });
    await renderRoute(route, persona, { store, noLatency: false, waitReady: false });
    expect(await screen.findAllByTestId("loading-state", {}, LONG)).not.toHaveLength(0);
    expect(await screen.findAllByTestId(route.ready, {}, LONG)).not.toHaveLength(0);
    await waitFor(() => expect(screen.queryAllByTestId("loading-state")).toHaveLength(0), LONG);
  };
}

function loaded(name: string, persona = P1, overrides: Partial<RouteCase> = {}): Scenario {
  return async () => {
    const route = routeOf(name, overrides);
    await renderRoute(route, persona);
    expect(screen.queryAllByTestId("error-state")).toHaveLength(0);
    expect(screen.queryAllByTestId("empty-state")).toHaveLength(0);
  };
}

function error500(name: string, persona = P1, overrides: Partial<RouteCase> = {}): Scenario {
  return async () => {
    const route = routeOf(name, overrides);
    const wallet = route.persona === "wallet";
    const store = await prepareStore(persona, async (repo) => {
      if (!wallet) await repo.demo.setFaults({ serverErrorRate: 1 });
    });
    const view = await renderRoute(route, persona, { store, waitReady: wallet });
    if (wallet) {
      // The session read already succeeded (a failed session read is the guard's ErrorState,
      // guard.test.tsx); the screen's own data read now fails with a 500.
      await view.repo().demo.setFaults({ serverErrorRate: 1 });
      await act(async () => {
        await view.services.queryClient.resetQueries({
          predicate: (q) => q.queryKey.includes("patient"),
        });
      });
    }
    const error = await screen.findByTestId("error-state", {}, LONG);
    await view.repo().demo.setFaults({ serverErrorRate: 0 });
    fireEvent.click(within(error).getByRole("button"));
    expect(await screen.findAllByTestId(route.ready, {}, LONG)).not.toHaveLength(0);
    await waitFor(() => expect(screen.queryAllByTestId("error-state")).toHaveLength(0), LONG);
  };
}

function empty(
  name: string,
  persona: string,
  prepare: (repo: CitizenRepository, store: StoreAdapter) => Promise<void>,
  then?: () => Promise<void>,
): Scenario {
  return async () => {
    const route = routeOf(name);
    const store = await prepareStore(persona, prepare);
    await renderRoute(route, persona, { store, waitReady: false });
    await then?.();
    expect(await screen.findAllByTestId("empty-state", {}, LONG)).not.toHaveLength(0);
    expect(screen.queryAllByTestId("error-state")).toHaveLength(0);
  };
}

/** Consent withdrawn (CTZ-P3): the guard redirects away; one `access.denied` audit. */
function deniedByGuard(...segments: string[]): Scenario {
  return async () => {
    resetRouter(["(app)", "(tabs)", ...segments]);
    const view = await renderShell(<AppGuard />, {
      before: (s) => s.session.switchTo(PERSONA_IDS.citizenWithdrawn),
    });
    const redirect = await screen.findByTestId("redirect", {}, LONG);
    expect(redirect.getAttribute("data-href")).toBe("/consent-withdrawn");
    await waitFor(async () =>
      expect((await auditsOf(view.store, "access.denied")).length).toBeGreaterThan(0),
    );
  };
}

/** Cross-patient deep link: CTZ-P4 (representative) opens CTZ-P1's record id. */
function deniedCrossPatient(name: string): Scenario {
  return async () => {
    const route = routeOf(name);
    const view = await renderRoute({ ...route, ready: "permission-denied" }, P4);
    expect(screen.getByTestId("permission-denied")).toBeTruthy();
    await waitFor(async () =>
      expect((await auditsOf(view.store, "access.denied")).length).toBeGreaterThan(0),
    );
  };
}

const conflictOnPatient = (view: ShellView, patientId = P1_PATIENT) =>
  view.repo().demo.setFaults({ conflictOnce: [{ entityType: "patient", entityId: patientId }] });

const type = (testId: string, value: string) =>
  fireEvent.change(screen.getByTestId(testId), { target: { value } });

async function fillCorrection() {
  await screen.findByTestId("correction-form", {}, LONG);
  type("correction-description", "The time of this check looks wrong to me.");
  fireEvent.click(screen.getByTestId("correction-understood"));
  fireEvent.click(screen.getByTestId("correction-continue-describe"));
  await screen.findByTestId("correction-review", {}, LONG);
}

const correctionRoute = () =>
  routeOf("(app)/(tabs)/more/privacy/corrections/new", { ready: "correction-form" });

function confirmStopReminders() {
  const buttons = screen.getAllByRole("button", { name: "Stop reminders" });
  fireEvent.click(buttons[buttons.length - 1]!);
}

// ── The matrix ──────────────────────────────────────────────────────────────

const MATRIX: Record<string, Record<UxState, Cell>> = {
  "persona list": {
    loading: loading("(onboarding)/persona", P1, { persona: null }),
    loaded: loaded("(onboarding)/persona", P1),
    empty: { na: "the five demo personas are always seeded (asserted in repo.test.ts)" },
    error500: error500("(onboarding)/persona"),
    denied: { na: "no persona needed and no health data shown" },
    conflict: { na: "no write (choosing a persona is local)" },
    success: async () => {
      await renderRoute(routeOf("(onboarding)/persona"), P1);
      expect(screen.getAllByTestId(/^persona-card-/u)).toHaveLength(5);
    },
    offline: OFFLINE_NA,
  },
  "health list": {
    loading: loading("(app)/(tabs)/health/index"),
    loaded: loaded("(app)/(tabs)/health/index"),
    empty: empty("(app)/(tabs)/health/index", P1, (_r, store) =>
      deleteWhere(store, "screenings", (s) => s["patientId"] === P1_PATIENT),
    ),
    error500: error500("(app)/(tabs)/health/index"),
    denied: deniedByGuard("health"),
    conflict: READ_ONLY,
    success: READ_ONLY,
    offline: OFFLINE_NA,
  },
  "health detail": {
    loading: loading("(app)/(tabs)/health/[observationId]"),
    loaded: loaded("(app)/(tabs)/health/[observationId]"),
    empty: async () => {
      // A pending (unreleased) result id → "not found" empty state, no values.
      const pending = SEED_ANCHORS.CTZ_P2_AWAITING_REVIEW_SCREENING.screeningId;
      await renderRoute(
        routeOf("(app)/(tabs)/health/[observationId]", {
          params: { observationId: pending },
          ready: "empty-state",
        }),
        P2,
      );
      expect(screen.queryByTestId("result-readings")).toBeNull();
    },
    error500: error500("(app)/(tabs)/health/[observationId]"),
    denied: deniedCrossPatient("(app)/(tabs)/health/[observationId]"),
    conflict: READ_ONLY,
    success: READ_ONLY,
    offline: OFFLINE_NA,
  },
  "next steps list": {
    loading: loading("(app)/(tabs)/next-steps/index"),
    loaded: loaded("(app)/(tabs)/next-steps/index"),
    empty: empty("(app)/(tabs)/next-steps/index", P1, (_r, store) =>
      deleteWhere(store, "careInstructions", (s) => s["patientId"] === P1_PATIENT),
    ),
    error500: error500("(app)/(tabs)/next-steps/index"),
    denied: deniedByGuard("next-steps"),
    conflict: READ_ONLY,
    success: READ_ONLY,
    offline: OFFLINE_NA,
  },
  "next step detail": {
    loading: loading("(app)/(tabs)/next-steps/[instructionId]"),
    loaded: loaded("(app)/(tabs)/next-steps/[instructionId]"),
    empty: {
      na: "one record: an unknown id gets the same PermissionDenied as a cross-scope id (no existence leak)",
    },
    error500: error500("(app)/(tabs)/next-steps/[instructionId]"),
    denied: deniedCrossPatient("(app)/(tabs)/next-steps/[instructionId]"),
    conflict: async () => {
      const view = await renderRoute(routeOf("(app)/(tabs)/next-steps/[instructionId]"), P1);
      await conflictOnPatient(view);
      fireEvent.click(screen.getByTestId("acknowledge"));
      expect(await screen.findByTestId("conflict-notice", {}, LONG)).toBeTruthy();
      expect(
        (await view.store.getAll<{ instructionId: string }>("nextStepAcks")).some(
          (a) => a.instructionId === P1_STEP_ID,
        ),
      ).toBe(false);
    },
    success: async () => {
      const view = await renderRoute(routeOf("(app)/(tabs)/next-steps/[instructionId]"), P1);
      fireEvent.click(screen.getByTestId("acknowledge"));
      expect(await screen.findByTestId("acknowledged", {}, LONG)).toBeTruthy();
      expect(await auditsOf(view.store, "citizen.next_step.acknowledged")).toHaveLength(1);
    },
    offline: OFFLINE_NA,
  },
  reminders: {
    loading: loading("(app)/(tabs)/reminders/index"),
    loaded: loaded("(app)/(tabs)/reminders/index"),
    empty: empty("(app)/(tabs)/reminders/index", P1, (_r, store) =>
      deleteWhere(store, "reminders", (s) => s["patientId"] === P1_PATIENT),
    ),
    error500: error500("(app)/(tabs)/reminders/index"),
    denied: deniedByGuard("reminders"),
    conflict: async () => {
      const view = await renderRoute(routeOf("(app)/(tabs)/reminders/index"), P1);
      await conflictOnPatient(view);
      fireEvent.click(screen.getByTestId("reminder-toggle"));
      confirmStopReminders();
      expect(await screen.findByTestId("prefs-conflict", {}, LONG)).toBeTruthy();
      expect(screen.getByTestId("reminder-toggle").getAttribute("aria-checked")).toBe("true");
    },
    success: async () => {
      await renderRoute(routeOf("(app)/(tabs)/reminders/index"), P1);
      fireEvent.click(screen.getByTestId("reminder-toggle"));
      confirmStopReminders();
      await waitFor(
        () =>
          expect(screen.getByTestId("reminder-toggle").getAttribute("aria-checked")).toBe("false"),
        LONG,
      );
      expect(screen.getAllByText("Reminders turned off").length).toBeGreaterThan(0);
    },
    offline: OFFLINE_NA,
  },
  timeline: {
    loading: loading("(app)/(tabs)/timeline/index"),
    loaded: loaded("(app)/(tabs)/timeline/index"),
    empty: empty(
      "(app)/(tabs)/timeline/index",
      P4,
      () => Promise.resolve(),
      async () => {
        // CTZ-P4 has no record changes: the "Changes" filter shows the empty state.
        fireEvent.click(await screen.findByRole("tab", { name: /^Changes,/u }, LONG));
      },
    ),
    error500: error500("(app)/(tabs)/timeline/index"),
    denied: deniedByGuard("timeline"),
    conflict: READ_ONLY,
    success: READ_ONLY,
    offline: OFFLINE_NA,
  },
  "access history": {
    loading: loading("(app)/(tabs)/more/privacy/access-history"),
    loaded: loaded("(app)/(tabs)/more/privacy/access-history"),
    empty: empty("(app)/(tabs)/more/privacy/access-history", P1, (_r, store) =>
      deleteWhere(store, "accessEvents", (s) => s["patientId"] === P1_PATIENT),
    ),
    error500: error500("(app)/(tabs)/more/privacy/access-history"),
    denied: deniedByGuard("more", "privacy", "access-history"),
    conflict: READ_ONLY,
    success: READ_ONLY,
    offline: OFFLINE_NA,
  },
  "corrections list": {
    loading: loading("(app)/(tabs)/more/privacy/corrections/index", P1, {
      ready: "corrections-list",
    }),
    loaded: loaded("(app)/(tabs)/more/privacy/corrections/index", P1, {
      ready: "corrections-list",
    }),
    // CTZ-P4 has no correction requests in the seed.
    empty: empty("(app)/(tabs)/more/privacy/corrections/index", P4, () => Promise.resolve()),
    error500: error500("(app)/(tabs)/more/privacy/corrections/index", P1, {
      ready: "corrections-list",
    }),
    denied: deniedByGuard("more", "privacy", "corrections"),
    conflict: READ_ONLY,
    success: READ_ONLY,
    offline: OFFLINE_NA,
  },
  "correction detail": {
    loading: loading("(app)/(tabs)/more/privacy/corrections/[requestId]"),
    loaded: loaded("(app)/(tabs)/more/privacy/corrections/[requestId]"),
    empty: async () => {
      // Unknown request id → "not found" empty state.
      await renderRoute(
        routeOf("(app)/(tabs)/more/privacy/corrections/[requestId]", {
          params: { requestId: "00000000-0000-4000-8000-00000000dead" },
          ready: "empty-state",
        }),
        P1,
      );
    },
    error500: error500("(app)/(tabs)/more/privacy/corrections/[requestId]"),
    denied: async () => {
      const view = await renderRoute(
        routeOf("(app)/(tabs)/more/privacy/corrections/[requestId]", {
          params: { requestId: P1_REQUEST_ID },
          ready: "correction-detail-screen",
        }),
        P4,
      );
      await waitFor(async () =>
        expect((await auditsOf(view.store, "access.denied")).length).toBeGreaterThan(0),
      );
      expect(screen.queryByTestId("correction-detail")).toBeNull();
    },
    conflict: READ_ONLY,
    success: READ_ONLY,
    offline: OFFLINE_NA,
  },
  "correction new": {
    loading: loading("(app)/(tabs)/more/privacy/corrections/new"),
    loaded: loaded("(app)/(tabs)/more/privacy/corrections/new"),
    empty: { na: "'My personal details' can always be corrected — the picker is never empty" },
    error500: error500("(app)/(tabs)/more/privacy/corrections/new"),
    denied: deniedByGuard("more", "privacy", "corrections", "new"),
    conflict: async () => {
      const view = await renderRoute(
        { ...correctionRoute(), params: { targetType: "screening", targetId: P1_RESULT_ID } },
        P1,
      );
      await fillCorrection();
      await conflictOnPatient(view);
      fireEvent.click(screen.getByTestId("correction-send"));
      expect(await screen.findByTestId("conflict-notice", {}, LONG)).toBeTruthy();
    },
    success: async () => {
      const view = await renderRoute(
        { ...correctionRoute(), params: { targetType: "screening", targetId: P1_RESULT_ID } },
        P1,
      );
      await fillCorrection();
      const before = (await auditsOf(view.store, "correction.requested")).length;
      fireEvent.click(screen.getByTestId("correction-send"));
      expect(await screen.findByTestId("correction-success", {}, LONG)).toBeTruthy();
      expect(await auditsOf(view.store, "correction.requested")).toHaveLength(before + 1);
    },
    offline: OFFLINE_NA,
  },
  settings: {
    loading: loading("(app)/(tabs)/more/accessibility", P2),
    loaded: loaded("(app)/(tabs)/more/accessibility", P2),
    empty: { na: "a settings form, not a list" },
    error500: async () => {
      // The read falls back to this phone's values; a failed SAVE shows the inline error.
      const view = await renderRoute(routeOf("(app)/(tabs)/more/accessibility"), P2);
      await view.repo().demo.setFaults({ serverErrorRate: 1 });
      fireEvent.click(screen.getByRole("radio", { name: "Larger" }));
      expect(await screen.findByTestId("accessibility-save-error", {}, LONG)).toBeTruthy();
      await view.repo().demo.setFaults({ serverErrorRate: 0 });
      fireEvent.click(screen.getByTestId("accessibility-retry"));
      await waitFor(
        () => expect(screen.queryByTestId("accessibility-save-error")).toBeNull(),
        LONG,
      );
    },
    denied: { na: "consent-free by design (device display preference, CTZ-08)" },
    conflict: async () => {
      const view = await renderRoute(routeOf("(app)/(tabs)/more/accessibility"), P2);
      // Another device saves first (the screen still holds the old version).
      const saved = (
        await view.store.getAll<{ personaId: string; version: number }>("citizenSettings")
      ).find((row) => row.personaId === P2);
      await act(async () => {
        await view
          .repo()
          .updateSettings(
            { highContrast: true, expectedVersion: saved?.version ?? 0 },
            crypto.randomUUID(),
          );
      });
      fireEvent.click(screen.getByRole("radio", { name: "Large" }));
      expect(
        await screen.findByText(
          "Your settings were changed somewhere else. We loaded your saved settings.",
          {},
          LONG,
        ),
      ).toBeTruthy();
    },
    success: async () => {
      const view = await renderRoute(routeOf("(app)/(tabs)/more/accessibility"), P2);
      fireEvent.click(screen.getByRole("radio", { name: "Largest" }));
      await waitFor(
        async () => expect(await auditsOf(view.store, "citizen.settings.changed")).toHaveLength(1),
        LONG,
      );
    },
    offline: OFFLINE_NA,
  },
  callback: {
    loading: loading("(app)/(tabs)/more/support/callback"),
    loaded: loaded("(app)/(tabs)/more/support/callback"),
    empty: { na: "a form, not a list" },
    error500: async () => {
      const view = await renderRoute(routeOf("(app)/(tabs)/more/support/callback"), P1);
      fireEvent.click(screen.getByRole("radio", { name: "Something else" }));
      fireEvent.click(screen.getByRole("radio", { name: "Afternoon" }));
      await view.repo().demo.setFaults({ serverErrorRate: 1 });
      fireEvent.click(screen.getByTestId("callback-send"));
      await waitFor(
        () => expect(screen.getByTestId("callback-send-error").textContent).not.toBe(""),
        LONG,
      );
      await view.repo().demo.setFaults({ serverErrorRate: 0 });
      fireEvent.click(screen.getByTestId("callback-send"));
      expect(await screen.findByTestId("callback-success", {}, LONG)).toBeTruthy();
      expect(await auditsOf(view.store, "citizen.support.callback_requested")).toHaveLength(1);
    },
    denied: async () => {
      // Enrollment pending (CTZ-P5): no linked record → callback unavailable, nothing sent.
      await renderRoute(
        routeOf("(app)/(tabs)/more/support/callback", { ready: "callback-disabled" }),
        PERSONA_IDS.citizenPending,
      );
      const view = screen.getByTestId("callback-send");
      expect(view.getAttribute("aria-disabled")).toBe("true");
    },
    conflict: { na: "append-only care task: no version to go stale" },
    success: async () => {
      await renderRoute(routeOf("(app)/(tabs)/more/support/callback"), P1);
      fireEvent.click(screen.getByRole("radio", { name: "A question about an appointment" }));
      fireEvent.click(screen.getByRole("radio", { name: "Morning" }));
      fireEvent.click(screen.getByTestId("callback-send"));
      expect(await screen.findByTestId("callback-success", {}, LONG)).toBeTruthy();
    },
    offline: OFFLINE_NA,
  },
};

afterEach(() => vi.restoreAllMocks());

describe("UX-state matrix", () => {
  it("covers every listed screen × every state (scenario or reasoned N/A)", () => {
    expect(Object.keys(MATRIX)).toEqual([
      "persona list",
      "health list",
      "health detail",
      "next steps list",
      "next step detail",
      "reminders",
      "timeline",
      "access history",
      "corrections list",
      "correction detail",
      "correction new",
      "settings",
      "callback",
    ]);
    for (const [screenName, cells] of Object.entries(MATRIX)) {
      expect(Object.keys(cells).sort(), screenName).toEqual([...STATES].sort());
      for (const cell of Object.values(cells)) {
        if (typeof cell !== "function") expect(cell.na.length).toBeGreaterThan(10);
      }
    }
  });

  const runnable = Object.entries(MATRIX).flatMap(([screenName, cells]) =>
    STATES.filter((state) => typeof cells[state] === "function").map(
      (state) => [screenName, state, cells[state] as Scenario] as const,
    ),
  );

  it.each(runnable)(
    "%s × %s",
    async (_screen, _state, scenario) => {
      await scenario();
    },
    30_000,
  );
});

describe("offline row (N/A): no network calls", () => {
  it("walking every route and running writes never calls fetch", async () => {
    const fetchSpy = vi.fn(() => Promise.reject(new Error("network is not used")));
    vi.stubGlobal("fetch", fetchSpy);
    try {
      for (const route of routesFor(P1)) await renderRoute(route, P1);
      await (MATRIX["next step detail"]!.success as Scenario)();
      await (MATRIX["callback"]!.success as Scenario)();
      await (MATRIX["correction new"]!.success as Scenario)();
      expect(fetchSpy).not.toHaveBeenCalled();
    } finally {
      vi.unstubAllGlobals();
    }
  }, 60_000);
});
