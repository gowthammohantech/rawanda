/**
 * CLN-11 state matrix (spec §7): the ten UX states.
 *
 * 1. `resolveBoundary` / `AsyncBoundary` (the one clinical state mapper, wrapping
 *    `@laif/ui-web`): every state from `{ status, data, error }` + Offline, with its landmark.
 * 2. Every async page × the states the boundary owns (loaded / serverError / offline /
 *    permissionDenied / empty / not found), through the real app with deterministic faults.
 *    Write-side states (validation, conflict, success) live in the feature tests named in the
 *    matrix below, and states that do not apply are N/A with the reason.
 *
 * | Page            | init | load | loaded | empty | valid. | 500 | denied | offline | conflict | success |
 * |-----------------|------|------|--------|-------|--------|-----|--------|---------|----------|---------|
 * | queue           | N/A¹ | ✓    | ✓      | ✓     | N/A²   | ✓   | ✓ guard| ✓       | N/A³     | N/A³    |
 * | patient search  | ✓⁴   | ✓    | ✓      | ✓     | ✓⁵     | ✓   | ✓ guard| ✓       | N/A³     | N/A³    |
 * | patient record  | N/A¹ | ✓    | ✓      | ✓ 404 | ✓⁶     | ✓   | ✓ scope| ✓       | ✓⁶       | ✓⁶      |
 * | review detail   | N/A¹ | ✓    | ✓      | ✓ 404 | N/A²   | ✓   | ✓ scope| ✓       | ✓⁷       | ✓⁷      |
 * | decision        | N/A¹ | ✓    | ✓⁸     | ✓ 404 | ✓⁸     | ✓   | ✓ guard| ✓⁸      | ✓⁸       | ✓⁸      |
 * | referrals       | N/A¹ | ✓    | ✓      | ✓     | ✓⁹     | ✓   | ✓ guard| ✓       | ✓⁹       | ✓⁹      |
 * | tasks           | N/A¹ | ✓    | ✓      | ✓     | ✓¹⁰    | ✓   | ✓ guard| ✓       | ✓¹⁰      | ✓¹⁰     |
 * | audit           | N/A¹ | ✓    | ✓      | ✓     | ✓¹¹    | ✓   | ✓ guard| ✓       | N/A³     | ✓¹¹     |
 * | settings        | N/A¹ | ✓    | ✓      | N/A¹² | N/A²   | N/A¹²| N/A¹³ | N/A¹²   | N/A³     | ✓¹²     |
 *
 * ¹ The screen requests its data on mount — there is no "nothing requested yet" moment.
 * ² No user input on the page that is validated.  ³ The page has no mutation.
 * ⁴ No query = the "recent in facility" list.  ⁵ Query length limit (PatientSearchPage.test).
 * ⁶ Amendment dialog (AmendScreeningDialog.test).  ⁷ Start / take over (ReviewDetailPage.test).
 * ⁸ DecisionPage.test (loaded needs an in-review case; offline keeps the draft).
 * ⁹ Referral dialogs (CompleteReferralDialog.test, ReferralsPage.test).
 * ¹⁰ Task dialogs + WF-02 conflict (AssignTaskDialog.test, ConflictResolutionDialog.test).
 * ¹¹ Invalid filter alert + export toast (AuditExplorerPage.test).
 * ¹² Local demo controls (SettingsPage.test).  ¹³ Every clinical persona may open Settings.
 */
import { FACILITY_IDS, PERSONA_IDS, SEED_ANCHORS, createSeed } from "@laif/mock-data";
import { createTestI18n, I18nProvider } from "@laif/i18n";
import { RepositoryError } from "@laif/repositories";
import { act, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { routes } from "../app/routes.ts";
import {
  AsyncBoundary,
  resolveBoundary,
  type AsyncBoundaryProps,
  type BoundaryQuery,
} from "../components/AsyncBoundary.tsx";
import { renderApp } from "../test/render-app.tsx";

const CLINICIAN = { personaId: PERSONA_IDS.clinAlpha1, facilityId: FACILITY_IDS.alpha1 };
const COORDINATOR = { personaId: PERSONA_IDS.coordAlpha, facilityId: FACILITY_IDS.alpha1 };
const seed = createSeed();
const alphaPatient = seed.patients.find((p) => p.facilityId === FACILITY_IDS.alpha1);
const WF01 = SEED_ANCHORS.WF01_FLAGGED_REVIEW;
const WF04 = SEED_ANCHORS.WF04_OTHER_FACILITY_PATIENT;

const repoError = (code: ConstructorParameters<typeof RepositoryError>[0]) =>
  new RepositoryError(code, { message: "internal test detail" });

function q<T = number[]>(over: Partial<BoundaryQuery<T>>): BoundaryQuery<T> {
  return {
    status: "success",
    data: undefined,
    error: null,
    dataUpdatedAt: Date.UTC(2026, 9, 14, 6, 0),
    refetch: () => undefined,
    ...over,
  };
}

describe("resolveBoundary — the ten UX states", () => {
  const cases: [
    string,
    ReturnType<typeof resolveBoundary>["state"],
    BoundaryQuery<number[]>,
    object,
  ][] = [
    ["initial", "initial", q({ status: "pending" }), { enabled: false }],
    ["loading", "loading", q({ status: "pending" }), {}],
    ["loaded", "loaded", q({ data: [1] }), {}],
    ["empty", "empty", q({ data: [] }), { isEmpty: (d: number[]) => d.length === 0 }],
    [
      "validationError",
      "validationError",
      q({ status: "error", error: repoError("VALIDATION_ERROR") }),
      {},
    ],
    ["serverError", "serverError", q({ status: "error", error: repoError("INTERNAL") }), {}],
    [
      "timeout → serverError",
      "serverError",
      q({ status: "error", error: repoError("TIMEOUT") }),
      {},
    ],
    [
      "permissionDenied",
      "permissionDenied",
      q({ status: "error", error: repoError("FORBIDDEN") }),
      {},
    ],
    [
      "offline (nothing cached)",
      "offline",
      q({ status: "error", error: repoError("OFFLINE") }),
      {},
    ],
    ["offline (cached)", "offline", q({ data: [1] }), { offline: true }],
    ["conflict", "conflict", q({ status: "error", error: repoError("CONFLICT") }), {}],
    ["success", "success", q({ data: [1] }), { successMessage: "Saved" }],
  ];
  it.each(cases)("%s", (_name, expected, query, options) => {
    expect(resolveBoundary(query, options).state).toBe(expected);
  });

  it("a failed refetch keeps the data, marked stale; FORBIDDEN never shows data", () => {
    const stale = resolveBoundary(q({ status: "error", data: [1], error: repoError("INTERNAL") }));
    expect(stale).toMatchObject({ state: "loaded", showData: true, stale: true });
    const cachedOffline = resolveBoundary(
      q({ status: "error", data: [1], error: repoError("OFFLINE") }),
    );
    expect(cachedOffline).toMatchObject({ state: "offline", showData: true, stale: true });
    const denied = resolveBoundary(
      q({ status: "error", data: [1], error: repoError("FORBIDDEN") }),
    );
    expect(denied).toMatchObject({ state: "permissionDenied", showData: false });
    expect(resolveBoundary(q({ status: "error", error: repoError("NOT_FOUND") }))).toMatchObject({
      state: "empty",
      notFound: true,
    });
  });
});

describe("AsyncBoundary renders each state's landmark", () => {
  const i18n = createTestI18n("en", { appId: "clinical" });
  const view = (
    query: BoundaryQuery<number[]>,
    extra: Partial<AsyncBoundaryProps<number[]>> = {},
  ) =>
    render(
      <I18nProvider i18n={i18n}>
        <AsyncBoundary<number[]>
          query={query}
          offline={false}
          isEmpty={(d) => d.length === 0}
          loadingLabel="Loading rows"
          testId="rows"
          {...extra}
        >
          {(data) => <p>rows: {data.length}</p>}
        </AsyncBoundary>
      </I18nProvider>,
    );
  const state = (c: HTMLElement) =>
    c.querySelector("[data-ux-state]")?.getAttribute("data-ux-state");

  it("initial / loading / loaded / empty / success", () => {
    expect(state(view(q({ status: "pending" }), { enabled: false }).container)).toBe("initial");
    const loading = view(q({ status: "pending" }));
    expect(state(loading.container)).toBe("loading");
    expect(screen.getByRole("group", { name: "Loading rows" }).getAttribute("aria-busy")).toBe(
      "true",
    );
    loading.unmount();
    const loaded = view(q({ data: [1, 2] }));
    expect(screen.getByText("rows: 2")).toBeTruthy();
    loaded.unmount();
    const empty = view(q({ data: [] }), { emptyFallback: <p>Nothing here</p> });
    expect(state(empty.container)).toBe("empty");
    expect(screen.getByText("Nothing here")).toBeTruthy();
    empty.unmount();
    view(q({ data: [1] }), { successMessage: "Saved to the demo store" });
    expect(screen.getByRole("status").textContent).toContain("Saved to the demo store");
    expect(screen.getByText("rows: 1")).toBeTruthy();
  });

  it("serverError has a retry and the error code; never internal text", () => {
    let retried = 0;
    view(q({ status: "error", error: repoError("INTERNAL"), refetch: () => (retried += 1) }));
    const alert = screen.getByRole("alert");
    expect(alert.textContent).toContain("INTERNAL");
    expect(alert.textContent).not.toContain("internal test detail");
    screen.getByRole("button", { name: "Try again" }).click();
    expect(retried).toBe(1);
  });

  it("permissionDenied renders the fallback only — no data", () => {
    view(q({ status: "error", data: [1], error: repoError("FORBIDDEN") }), {
      permissionFallback: <p>Not in your scope</p>,
    });
    expect(screen.getByText("Not in your scope")).toBeTruthy();
    expect(screen.queryByText(/rows:/)).toBeNull();
  });

  it("offline with cached data: 'Last updated' marker + the data; without cache: offline error", () => {
    const cached = view(q({ data: [3] }), { offline: true });
    expect(state(cached.container)).toBe("offline");
    expect(screen.getByTestId("rows-stale").textContent).toMatch(/Last updated \d\d:\d\d/);
    expect(screen.getByText("rows: 1")).toBeTruthy();
    cached.unmount();
    view(q({ status: "error", error: repoError("OFFLINE") }));
    expect(screen.getByRole("alert").textContent).toContain("OFFLINE");
  });

  it("conflict uses the conflict slot; validation and not-found have their own copy", () => {
    const conflict = view(q({ status: "error", error: repoError("CONFLICT") }), {
      conflict: <p>Reload the latest</p>,
    });
    expect(screen.getByText("Reload the latest")).toBeTruthy();
    conflict.unmount();
    const notFound = view(q({ status: "error", error: repoError("NOT_FOUND") }), {
      notFoundFallback: <p>No such record</p>,
    });
    expect(screen.getByText("No such record")).toBeTruthy();
    notFound.unmount();
    const invalid = view(q({ status: "error", error: repoError("VALIDATION_ERROR") }));
    expect(state(invalid.container)).toBe("validationError");
  });
});

type PageCase = { page: string; path: string; signIn?: typeof CLINICIAN };
const PAGES: PageCase[] = [
  { page: "queue", path: routes.queue() },
  { page: "patient search", path: routes.patients() },
  { page: "patient record", path: routes.patient(alphaPatient?.id ?? "") },
  { page: "review detail", path: routes.review(WF01.reviewId) },
  { page: "decision", path: routes.decision(WF01.reviewId) },
  { page: "referrals", path: routes.referrals() },
  { page: "tasks", path: routes.tasks() },
  { page: "audit", path: routes.audit(), signIn: COORDINATOR },
];

/** Opens `path` after the faults are set (a fresh query cache for that page). */
async function openWithFaults(path: string, patch: object, signIn = CLINICIAN) {
  const app = await renderApp({ path: routes.settings(), signIn, strict: false });
  await app.services.repo.demo.setFaults(patch);
  await act(async () => {
    await app.router.navigate(path);
  });
  return app;
}

const main = () => screen.getByRole("main");
const uxStates = () =>
  [...main().querySelectorAll("[data-ux-state]")].map((el) => el.getAttribute("data-ux-state"));

describe("every async page × boundary states (real app, deterministic faults)", () => {
  it.each(PAGES)(
    "$page: serverError — ErrorState with retry, no data",
    async ({ path, signIn }) => {
      await openWithFaults(path, { serverErrorRate: 1 }, signIn);
      await waitFor(() => expect(uxStates()).toContain("serverError"), { timeout: 5000 });
      expect(main().querySelector("[data-ux-state=serverError] [role=alert]")).not.toBeNull();
      expect(main().textContent).not.toContain(WF01.patientId);
    },
  );

  it.each(PAGES)("$page: offline with nothing cached — offline error", async ({ path, signIn }) => {
    await openWithFaults(path, { offline: true }, signIn);
    await waitFor(() => expect(uxStates()).toContain("offline"), { timeout: 5000 });
    expect(main().textContent).toContain("OFFLINE");
  });

  it.each(PAGES.filter((p) => p.page !== "decision"))(
    "$page: loaded — no error state, an h1",
    async ({ path, signIn }) => {
      await openWithFaults(path, {}, signIn);
      await waitFor(
        () => {
          expect(uxStates().some((s) => s === "loading")).toBe(false);
          expect(screen.getAllByRole("heading", { level: 1 }).length).toBe(1);
        },
        { timeout: 5000 },
      );
      expect(uxStates().filter((s) => s === "serverError" || s === "offline")).toEqual([]);
    },
  );

  it("permission denied: out-of-scope patient + review (scope), and route guards", async () => {
    await openWithFaults(routes.patient(WF04.patientId), {});
    await waitFor(() => expect(uxStates()).toContain("permissionDenied"));
    expect(screen.getByTestId("permission-denied").getAttribute("data-reason")).toBe(
      "patient-scope",
    );
  });

  it("permission denied: the coordinator on the decision route (guard)", async () => {
    await openWithFaults(routes.decision(WF01.reviewId), {}, COORDINATOR);
    expect(await screen.findByTestId("permission-denied")).toBeTruthy();
  });

  it("not found: an unknown review id → the not-found empty state", async () => {
    await openWithFaults(routes.review("00000000-0000-4000-8000-000000000000"), {});
    expect(await screen.findByTestId("review-not-found")).toBeTruthy();
  });

  it("empty: a patient search with no match", async () => {
    await openWithFaults(routes.patients({ q: "zzzz-no-such-patient" }), {});
    await waitFor(() => expect(uxStates()).toContain("empty"));
  });

  it("settings: loading skeleton then loaded (no remote read)", async () => {
    await renderApp({ path: routes.settings(), signIn: CLINICIAN });
    await waitFor(() => expect(screen.queryByTestId("settings-skeleton")).toBeNull());
    expect(screen.getByRole("heading", { level: 1 }).textContent).toBe("Settings");
  });
});
