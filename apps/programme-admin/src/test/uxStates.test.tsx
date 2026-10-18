/**
 * ADM-09 task 6 — UX-state inventory: every admin page × the spec §7 states, table-driven through
 * `renderWithAdmin({ persona, faults, path })` (memory repository, seeded admin slice):
 *
 * initial · loading · loaded · empty (period with no data) · validation error (bad URL filter) ·
 * server error · permission denied (out-of-scope district) · offline · stale/conflict (where it
 * applies) · success (where it applies).
 *
 * "n/a" cells are states a page does not have (Governance and Settings are not period-filtered;
 * stale applies to the source-write-aware Overview, conflict to the Settings threshold — further
 * conflict flows live in their feature tests: programme actions, triage, grants).
 */
import { enResources } from "@laif/i18n";
import { PERSONA_IDS } from "@laif/mock-data";
import { readStoreCollection } from "@laif/test-utils";
import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";

import { renderWithAdmin } from "./app.tsx";

const EN = enResources.admin as unknown as {
  overview: { empty: { title: string }; stale: string };
  funnel: { empty: { title: string; stage: string } };
  workload: { empty: string };
  quality: { empty: string };
  reports: { preview: { emptyTitle: string } };
  filters: { notice: { title: string } };
};

type PageCase = {
  name: string;
  path: string;
  testId: string;
  /** Text of the empty state (period without data); null = not period-filtered. */
  empty: string | null;
  /** Bad URL filters reset with a notice; false = the page has no global filters. */
  filters: boolean;
  /** Steps to reach the figures (Reports: template step → preview). */
  reach?: (user: ReturnType<typeof userEvent.setup>) => Promise<void>;
};

const PAGES: readonly PageCase[] = [
  {
    name: "overview",
    path: "/admin/overview",
    testId: "overview-page",
    empty: EN.overview.empty.title,
    filters: true,
  },
  {
    name: "funnel",
    path: "/admin/funnel",
    testId: "funnel-page",
    empty: EN.funnel.empty.title,
    filters: true,
  },
  {
    name: "funnel stage",
    path: "/admin/funnel/reviewed",
    testId: "funnel-stage-page",
    empty: EN.funnel.empty.stage,
    filters: true,
  },
  {
    name: "timeliness",
    path: "/admin/timeliness",
    testId: "timeliness-page",
    empty: "No reviews pending in this scope",
    filters: true,
  },
  {
    name: "workload",
    path: "/admin/workload",
    testId: "workload-page",
    empty: EN.workload.empty,
    filters: true,
  },
  {
    name: "quality",
    path: "/admin/quality",
    testId: "quality-page",
    empty: EN.quality.empty,
    filters: true,
  },
  {
    name: "reports",
    path: "/admin/reports?template=programme_summary",
    testId: "reports-page",
    empty: EN.reports.preview.emptyTitle,
    filters: true,
    reach: async (user) => {
      await user.click(await screen.findByRole("button", { name: "Next" }, LONG));
    },
  },
  {
    name: "governance",
    path: "/admin/governance",
    testId: "governance-page",
    empty: null,
    filters: false,
  },
  {
    name: "settings",
    path: "/admin/settings",
    testId: "settings-page",
    empty: null,
    filters: false,
  },
];

const ANALYST = PERSONA_IDS.analystAlpha;
const CHART = { width: 800, height: 240 };
const EMPTY_PERIOD = "preset=custom&from=2020-01-01&to=2020-01-31";
const withQuery = (path: string, query: string) =>
  `${path}${path.includes("?") ? "&" : "?"}${query}`;
const LONG = { timeout: 15_000 };

const noBusy = () =>
  waitFor(() => expect(document.querySelector("main [aria-busy='true']")).toBeNull(), LONG);

describe.each(PAGES)("UX states: $name", (page) => {
  it("initial → loading → loaded", async () => {
    const { release } = await renderWithAdmin({
      persona: ANALYST,
      path: page.path,
      latency: true,
      chartSize: CHART,
    });
    // initial: the shell landmarks and the always-visible banner, before any figure.
    expect(await screen.findByTestId("demo-banner", {}, LONG)).toBeTruthy();
    expect(screen.getByRole("main")).toBeTruthy();
    expect(screen.getByRole("banner")).toBeTruthy();
    // loading: repository calls are held — a labelled busy skeleton, no figures.
    await waitFor(
      () => expect(document.querySelector("main [aria-busy='true']")).not.toBeNull(),
      LONG,
    );
    expect(screen.queryByTestId("kpi-strip")).toBeNull();
    // loaded: the page, its h1, no busy region, no error.
    release();
    expect(await screen.findByTestId(page.testId, {}, LONG)).toBeTruthy();
    await noBusy();
    expect(within(screen.getByRole("main")).getByRole("heading", { level: 1 })).toBeTruthy();
    expect(within(screen.getByRole("main")).queryByText("Something went wrong")).toBeNull();
  });

  it.runIf(page.empty !== null)("empty: a period with no data", async () => {
    await renderWithAdmin({
      persona: ANALYST,
      path: withQuery(page.path, EMPTY_PERIOD),
      chartSize: CHART,
    });
    await screen.findByTestId(page.testId, {}, LONG);
    await page.reach?.(userEvent.setup());
    expect((await screen.findAllByText(page.empty ?? "", {}, LONG)).length).toBeGreaterThan(0);
  });

  it.runIf(page.filters)("validation error: a bad URL filter is reset with a notice", async () => {
    await renderWithAdmin({
      persona: ANALYST,
      path: withQuery(page.path, "preset=bogus"),
      chartSize: CHART,
    });
    await screen.findByTestId(page.testId, {}, LONG);
    expect(await screen.findByText(EN.filters.notice.title, {}, LONG)).toBeTruthy();
  });

  it("server error: ErrorState with Retry, no figures", async () => {
    await renderWithAdmin({
      persona: ANALYST,
      path: page.path,
      faults: { serverErrorRate: 1 },
      chartSize: CHART,
      // Settings reads the threshold itself: start without it, so its own load fails.
      prefetchSettings: page.name !== "settings",
    });
    const main = await screen.findByRole("main", {}, LONG);
    const alerts = await within(main).findAllByRole("alert", {}, LONG);
    expect(alerts.some((a) => a.textContent?.includes("Something went wrong"))).toBe(true);
    expect(within(main).getAllByRole("button", { name: "Try again" }).length).toBeGreaterThan(0);
    expect(screen.queryByTestId("kpi-strip")).toBeNull();
  });

  it("permission denied: an out-of-scope district → 403", async () => {
    await renderWithAdmin({
      persona: ANALYST,
      path: withQuery(page.path, "district=dist-beta"),
      chartSize: CHART,
    });
    expect(
      await screen.findByRole("heading", { level: 1, name: "Outside your authorised scope" }, LONG),
    ).toBeTruthy();
    expect(screen.queryByTestId(page.testId)).toBeNull();
  });

  it("offline: the offline banner and an offline ErrorState, never invented figures", async () => {
    await renderWithAdmin({
      persona: ANALYST,
      path: page.path,
      faults: { offline: true },
      chartSize: CHART,
    });
    expect(
      await screen.findByText("You are offline. Changes are saved on this device.", {}, LONG),
    ).toBeTruthy();
    if (page.name === "settings") {
      // Settings keeps the threshold in force (loaded for the session) and the demo tools.
      expect(await screen.findByTestId("threshold-readonly", {}, LONG)).toBeTruthy();
      return;
    }
    const main = await screen.findByRole("main", {}, LONG);
    const alerts = await within(main).findAllByRole("alert", {}, LONG);
    expect(alerts.some((a) => a.textContent?.includes("You are offline"))).toBe(true);
    expect(screen.queryByTestId("kpi-strip")).toBeNull();
  });
});

describe("UX states: stale / conflict / success where they apply", () => {
  it("overview stale: a newer source write shows 'Data changed — Refresh'", async () => {
    const user = userEvent.setup();
    const { store, services } = await renderWithAdmin({
      persona: ANALYST,
      path: "/admin/overview",
      chartSize: CHART,
    });
    await screen.findByTestId("kpi-strip", {}, LONG);
    const [screening] = await readStoreCollection<{ id: string; updatedAt: string }>(
      store,
      "screenings",
    );
    if (screening === undefined) throw new Error("no screening");
    await store.put("screenings", { ...screening, updatedAt: "2026-10-14T07:30:00.000Z" });
    await services.queryClient.refetchQueries({ queryKey: ["admin", "scoped"], type: "active" });
    const refresh = await screen.findByRole("button", { name: EN.overview.stale }, LONG);
    await user.click(refresh);
    await waitFor(
      () => expect(screen.queryByRole("button", { name: EN.overview.stale })).toBeNull(),
      LONG,
    );
  });

  it("settings conflict + success: stale threshold → conflict notice; re-apply saves", async () => {
    const user = userEvent.setup();
    await renderWithAdmin({
      persona: PERSONA_IDS.leadProgramme,
      path: "/admin/settings",
      faults: { conflictOnce: [{ entityType: "audit_event", entityId: "admin-settings" }] },
    });
    const input = await screen.findByRole("spinbutton", { name: /New threshold/ }, LONG);
    await user.clear(input);
    await user.type(input, "7");
    await user.type(
      screen.getByRole("textbox", { name: /Justification/ }),
      "Inventory check of the conflict state.",
    );
    await user.click(screen.getByRole("button", { name: "Save threshold" }));
    expect(
      await screen.findByText("The threshold was changed by someone else", {}, LONG),
    ).toBeTruthy();
    await user.click(screen.getByRole("button", { name: /Re-apply/ }));
    expect(
      await screen.findByText("Threshold updated — dashboards recalculated", {}, LONG),
    ).toBeTruthy();
  });
});
