import { kigaliDate } from "@laif/analytics";
import { DISTRICT_IDS, PERSONA_IDS } from "@laif/mock-data";
import { act, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";

import { DEFAULT_FILTERS, resolvePeriod } from "../../features/filters/filterSchema.ts";
import { loadMetricsDataset } from "../../features/metrics/loadMetricsDataset.ts";
import { selectOverview } from "../../features/metrics/selectOverview.ts";
import { bootApp } from "../../test/app.tsx";

const CHART = { width: 800, height: 240 };

async function openOverview(
  path = "/admin/overview",
  personaId: string = PERSONA_IDS.leadProgramme,
) {
  const result = await bootApp({ path, signInAs: personaId, chartSize: CHART });
  await screen.findByTestId("kpi-strip", {}, { timeout: 15_000 });
  return result;
}

const kpi = (id: string) => screen.getByTestId(`kpi-${id}`);

describe("OverviewPage", () => {
  it("renders the seeded, record-derived KPIs (equal to the selector over the same dataset)", async () => {
    const { services } = await openOverview();
    const { persona, grant } = services.session.getState();
    if (persona === null) throw new Error("no persona");
    const period = resolvePeriod(DEFAULT_FILTERS, kigaliDate(services.clock.now()));
    const loaded = await loadMetricsDataset(
      services.repo,
      { persona, grant },
      DEFAULT_FILTERS,
      period,
    );
    const expected = selectOverview(loaded.dataset, 5);
    const screened = expected.totals.screened.value ?? -1;
    expect(within(kpi("screened")).getByText(screened.toLocaleString("en-GB"))).toBeTruthy();
    expect(kpi("screened").textContent).toContain("Screenings recorded");
    expect(kpi("flagged").textContent).toContain(String(expected.totals.flagged.value));
    // Dismissed reviews appear in the "Clinically reviewed" sub-label…
    expect(kpi("reviewed").textContent).toMatch(/\d+ dismissed with reason/);
    // …and every KPI cell has a definition popover.
    expect(within(kpi("followUpCompleted")).getByRole("button", { name: /About/ })).toBeTruthy();
    expect(screen.getByTestId("computed-stamp").textContent).toMatch(
      /Computed \d\d:\d\d \(Kigali\)/,
    );
    expect(screen.getByTestId("overview-footnote").textContent).toMatch(
      /Synthetic demonstration data · \d+ records excluded \(consent withdrawn\) · metrics version demo-metrics-1/,
    );
    expect(screen.getByTestId("pilot-kpis").textContent).toContain(
      "Not measured in this prototype (deferred)",
    );
    expect(screen.getByTestId("screening-type").textContent).toContain("Blood pressure only");
    expect(screen.getByTestId("needs-attention").textContent).toContain("Overdue referrals");
  });

  it("every chart has a working View as table toggle and a figcaption", async () => {
    const user = userEvent.setup();
    await openOverview();
    for (const id of ["chart-weekly", "chart-facility"]) {
      const frame = screen.getByTestId(id);
      expect(frame.querySelector("figcaption")?.textContent?.length).toBeGreaterThan(10);
      const toggle = within(frame).getByRole("button", { name: "View as table" });
      await user.click(toggle);
      const table = within(frame).getByTestId("chart-table");
      expect(within(table).getAllByRole("row").length).toBeGreaterThan(1);
      expect(
        within(frame).getByRole("button", { name: "View as chart" }).getAttribute("aria-pressed"),
      ).toBe("true");
    }
    // Back to the chart: Recharts SVG (fixed test size) + a legend with dash/marker swatches.
    const weekly = screen.getByTestId("chart-weekly");
    await user.click(within(weekly).getByRole("button", { name: "View as chart" }));
    const legend = within(weekly).getByRole("list", { name: "Legend" });
    expect(
      within(legend)
        .getAllByRole("listitem")
        .map((li) => li.textContent),
    ).toEqual(["Screenings", "Flagged"]);
    expect(legend.querySelector("line[stroke-dasharray]")).not.toBeNull();
    expect(legend.querySelector("rect")).not.toBeNull();
    expect(within(weekly).getByRole("img").querySelector("svg")).not.toBeNull();
  });

  it("District Beta: small cells show <5 with the SUPPRESSED pill and a screen-reader text", async () => {
    await openOverview(`/admin/overview?district=${DISTRICT_IDS.beta}`);
    const completed = kpi("followUpCompleted");
    expect(completed.querySelector('[data-suppressed="true"]')).not.toBeNull();
    expect(completed.textContent).toContain("<5");
    expect(completed.textContent).toContain("SUPPRESSED");
    expect(within(completed).getByText("Fewer than 5, hidden to protect privacy")).toBeTruthy();
  });

  it("changing a filter updates the URL; the view follows the URL", async () => {
    const user = userEvent.setup();
    const { router } = await openOverview();
    await user.selectOptions(screen.getByLabelText("Date range"), "30d");
    await waitFor(() => expect(router.state.location.search).toBe("?preset=30d"));
    await user.selectOptions(screen.getByRole("combobox", { name: "Screening type" }), "glucose");
    await waitFor(() => expect(router.state.location.search).toBe("?preset=30d&type=glucose"));
    await waitFor(() => expect(screen.getByTestId("kpi-strip")).toBeTruthy());
    // The sidebar keeps the filters across pages.
    const nav = screen.getByRole("navigation", { name: "Main navigation" });
    expect(within(nav).getByRole("link", { name: "Timeliness" }).getAttribute("href")).toBe(
      "/admin/timeliness?preset=30d&type=glucose",
    );
    await user.click(screen.getByRole("button", { name: "Reset filters" }));
    await waitFor(() => expect(router.state.location.search).toBe(""));
  });

  it("the same URL in a new tab (same session/store) shows identical numbers", async () => {
    const path = "/admin/overview?preset=30d&type=glucose";
    const first = await openOverview(path);
    const text = (id: string) => kpi(id).querySelector("p")?.textContent;
    const ids = ["screened", "flagged", "reviewed", "followUpCompleted", "medianDaysToReview"];
    const before = ids.map(text);
    first.unmount();
    await bootApp({
      path,
      store: first.store,
      signInAs: PERSONA_IDS.leadProgramme,
      chartSize: CHART,
    });
    await screen.findByTestId("kpi-strip", {}, { timeout: 15_000 });
    expect(ids.map(text)).toEqual(before);
  });

  it("custom range with the end before the start shows an inline error and applies nothing", async () => {
    const user = userEvent.setup();
    const { router } = await openOverview();
    await user.selectOptions(screen.getByLabelText("Date range"), "custom");
    const form = await screen.findByTestId("custom-range");
    const from = within(form).getByLabelText("From");
    const to = within(form).getByLabelText("To");
    await user.clear(from);
    await user.type(from, "2026-10-10");
    await user.clear(to);
    await user.type(to, "2026-10-01");
    await user.click(within(form).getByRole("button", { name: "Apply" }));
    expect(within(form).getByRole("alert").textContent).toContain(
      "Start date must be on or before end date",
    );
    expect(from.getAttribute("aria-invalid")).toBe("true");
    expect(router.state.location.search).toBe("");
  });

  it("invalid URL params are replaced by defaults with a dismissible notice", async () => {
    const user = userEvent.setup();
    const { router } = await openOverview("/admin/overview?preset=7y&type=lipids");
    await waitFor(() => expect(router.state.location.search).toBe(""));
    const notice = await screen.findByTestId("filter-notice");
    expect(notice.textContent).toContain("Unknown date range");
    await user.click(within(notice).getByRole("button", { name: "Dismiss" }));
    await waitFor(() => expect(screen.queryByTestId("filter-notice")).toBeNull());
  });

  it("empty period: KPI 0 and the empty state with Widen date range", async () => {
    await bootApp({
      path: "/admin/overview?preset=custom&from=2025-01-01&to=2025-01-31",
      signInAs: PERSONA_IDS.leadProgramme,
      chartSize: CHART,
    });
    expect(
      await screen.findByText("No screenings recorded in this period", {}, { timeout: 15_000 }),
    ).toBeTruthy();
    expect(kpi("screened").textContent).toContain("0");
    expect(screen.getByRole("button", { name: "Widen date range" })).toBeTruthy();
    expect(screen.queryByTestId("chart-weekly")).toBeNull();
  });

  it("server error → ErrorState with Retry, never stale numbers", async () => {
    const user = userEvent.setup();
    const { services, router } = await openOverview();
    await services.repo.demo.setFaults({ serverErrorRate: 1 });
    await act(() => router.navigate("/admin/overview?preset=30d"));
    const alert = await screen.findByRole("alert", {}, { timeout: 15_000 });
    expect(alert.textContent).toContain("could not be loaded");
    expect(screen.queryByTestId("kpi-strip")).toBeNull();
    await services.repo.demo.setFaults({ serverErrorRate: 0 });
    await user.click(within(alert).getByRole("button", { name: /try again/i }));
    await screen.findByTestId("kpi-strip", {}, { timeout: 15_000 });
  });

  it("district analyst: the district select is locked to the grant", async () => {
    await openOverview(`/admin/overview?district=${DISTRICT_IDS.alpha}`, PERSONA_IDS.analystAlpha);
    const select = screen.getByLabelText<HTMLSelectElement>("District");
    expect(select.disabled).toBe(true);
    expect(select.value).toBe(DISTRICT_IDS.alpha);
  });

  it("RW: labels change, values stay identical", async () => {
    const user = userEvent.setup();
    await openOverview();
    const before = kpi("screened").querySelector("p")?.textContent;
    await user.click(screen.getByRole("button", { name: "Ikinyarwanda" }));
    await waitFor(() => expect(kpi("screened").textContent).toContain("Ibipimo byafashwe"));
    expect(kpi("screened").querySelector("p")?.textContent).toBe(before);
    expect(screen.getAllByRole("button", { name: "Reba mu mbonerahamwe" }).length).toBe(2);
  });
});
