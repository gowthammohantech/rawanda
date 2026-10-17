/**
 * `/admin/timeliness` (ADM-04 §9–10): seeded render equal to the selector over the same dataset,
 * the overdue trend's last table row = the Overdue KPIs = the overview "Needs attention" card,
 * District Beta's SUPPRESSED median for the programme lead, table toggles + generated captions,
 * RW plural rendering, the empty period, and no UI element calling pending reviews "overdue".
 */
import { kigaliDate } from "@laif/analytics";
import { DISTRICT_IDS, PERSONA_IDS } from "@laif/mock-data";
import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";

import type { AppServices } from "../../app/services.ts";
import { DEFAULT_FILTERS, resolvePeriod } from "../../features/filters/filterSchema.ts";
import { loadMetricsDataset } from "../../features/metrics/loadMetricsDataset.ts";
import { selectOverview } from "../../features/metrics/selectOverview.ts";
import { selectTimeliness } from "../../features/timeliness/selectTimeliness.ts";
import { bootApp } from "../../test/app.tsx";

const CHART = { width: 800, height: 240 };

async function openTimeliness(
  path = "/admin/timeliness",
  personaId: string = PERSONA_IDS.leadProgramme,
) {
  const result = await bootApp({ path, signInAs: personaId, chartSize: CHART });
  await screen.findByTestId("kpi-strip", {}, { timeout: 15_000 });
  return result;
}

async function scopeDataset(services: AppServices) {
  const { persona, grant } = services.session.getState();
  if (persona === null) throw new Error("no persona");
  const period = resolvePeriod(DEFAULT_FILTERS, kigaliDate(services.clock.now()));
  return (await loadMetricsDataset(services.repo, { persona, grant }, DEFAULT_FILTERS, period))
    .dataset;
}

const kpi = (id: string) => screen.getByTestId(`kpi-${id}`);
const kpiValue = (id: string) => kpi(id).querySelector("p")?.textContent ?? "";

describe("TimelinessPage", () => {
  it("renders the seeded KPIs, the no-target label, the callout and the as-of stamp", async () => {
    const { services } = await openTimeliness();
    const view = selectTimeliness(
      await scopeDataset(services),
      { district: null, facility: null },
      5,
    );
    expect(screen.getByTestId("kpi-strip").children).toHaveLength(6);
    const median = view.kpis.median.value;
    expect(median).not.toBeNull();
    expect(kpiValue("medianDaysToReview")).toBe(`${(median as number).toFixed(1)} days`);
    expect(kpi("medianDaysToReview").textContent).toContain(
      `n = ${String(view.kpis.reviews.value)} reviews`,
    );
    expect(kpi("p90DaysToReview").textContent).toContain("90th percentile");
    expect(kpi("reviewsPending").textContent).toMatch(/waiting 8\+ days/);
    expect(kpi("medianDaysToReferralCompletion").textContent).toContain(
      "Median days to referral completion",
    );
    expect(screen.getByTestId("no-target").textContent).toBe("No approved review target");
    expect(screen.getByTestId("overdue-callout").textContent).toContain(
      "Overdue means a due date set by a clinician has passed",
    );
    expect(screen.getByTestId("as-of").textContent).toMatch(/^As of .+ \(Kigali\)$/);
    // Overdue KPI cells link to the referred-stage drill-down, keeping the filters.
    const link = within(kpi("overdueReferrals")).getByRole("link");
    expect(link.getAttribute("href")).toMatch(/^\/admin\/funnel\/referred/);
    // Facility rows narrow Timeliness to the facility.
    const rows = within(screen.getByTestId("chart-facility-median")).getAllByRole("link");
    expect(rows[0]?.getAttribute("href")).toMatch(/^\/admin\/timeliness\?.*facility=/);
  });

  it("overdue trend: the last table row = the Overdue KPIs = the overview card", async () => {
    const user = userEvent.setup();
    const { services } = await openTimeliness();
    const ds = await scopeDataset(services);
    const overview = selectOverview(ds, 5);
    const frame = screen.getByTestId("chart-overdue");
    await user.click(within(frame).getByRole("button", { name: "View as table" }));
    const table = within(frame).getByTestId("chart-table");
    const bodyRows = within(table).getAllByRole("row").slice(1);
    expect(bodyRows).toHaveLength(12);
    const last = bodyRows.at(-1)!;
    expect(last.textContent).toContain("(to now)");
    const cells = within(last)
      .getAllByRole("cell")
      .map((c) => c.textContent);
    expect(cells[0]).toBe(kpiValue("overdueReferrals"));
    expect(cells[1]).toBe(kpiValue("overdueFollowUps"));
    expect(kpiValue("overdueReferrals")).toBe(
      String(overview.needsAttention.overdueReferrals.value),
    );
    expect(kpiValue("overdueFollowUps")).toBe(
      String(overview.needsAttention.overdueFollowUps.value),
    );
  });

  it("both charts have a table alternative listing every week and a generated caption", async () => {
    const user = userEvent.setup();
    const { services } = await openTimeliness();
    const view = selectTimeliness(
      await scopeDataset(services),
      { district: null, facility: null },
      5,
    );
    for (const id of ["chart-median", "chart-overdue"]) {
      const frame = screen.getByTestId(id);
      expect(frame.querySelector("figcaption")?.textContent?.length ?? 0).toBeGreaterThan(20);
      await user.click(within(frame).getByRole("button", { name: "View as table" }));
      const rows = within(within(frame).getByTestId("chart-table")).getAllByRole("row");
      const weeks = id === "chart-median" ? view.medianTrend.length : view.overdueTrend.length;
      expect(rows.length - 1).toBe(weeks);
    }
    expect(screen.getByTestId("chart-overdue").querySelector("figcaption")?.textContent).toMatch(
      /^Overdue referrals (rose|fell|stayed).* over 12 weeks; overdue follow-ups (rose|fell|stayed)/,
    );
  });

  it("District Beta (programme lead, last 30 days): the median shows the SUPPRESSED pill", async () => {
    // Seed reality: District Beta has 4 reviews in the last 30 days (< k = 5) but 10 in the
    // default 90 days, so the suppressed state is shown on the 30-day preset.
    await openTimeliness(`/admin/timeliness?preset=30d&district=${DISTRICT_IDS.beta}`);
    const cell = kpi("medianDaysToReview");
    await waitFor(() => expect(cell.querySelector("[data-suppressed='true']")).not.toBeNull());
    expect(cell.textContent).toContain("SUPPRESSED");
    expect(cell.textContent).toContain("Hidden");
    expect(within(cell).getByText(/Hidden to protect privacy/)).toBeTruthy();
  });

  it("District Alpha analyst: District Beta in the URL → 403", async () => {
    await bootApp({
      path: `/admin/timeliness?district=${DISTRICT_IDS.beta}`,
      signInAs: PERSONA_IDS.analystAlpha,
      waitFor: "forbidden-page",
    });
    expect(screen.queryByTestId("timeliness-page")).toBeNull();
  });

  it("RW: plural day units and generated captions in Kinyarwanda", async () => {
    const user = userEvent.setup();
    await openTimeliness();
    await user.click(screen.getByRole("button", { name: "Ikinyarwanda" }));
    await waitFor(() =>
      expect(kpi("medianDaysToReview").textContent).toContain("Iminsi yo hagati kugeza isuzuma"),
    );
    expect(kpiValue("medianDaysToReview")).toMatch(/^iminsi \d+[.,]\d$/);
    expect(screen.getByTestId("no-target").textContent).toBe("Nta ntego y'isuzuma yemejwe");
    expect(screen.getByTestId("chart-overdue").querySelector("figcaption")?.textContent).toMatch(
      /^Ibyoherezwa byarengeje igihe .*mu byumweru 12; ikurikiranwa/,
    );
  });

  it("empty period: '—' with 'No completed reviews', zero overdue with a check + text", async () => {
    await openTimeliness("/admin/timeliness?preset=custom&from=2025-01-01&to=2025-01-31");
    expect(kpiValue("medianDaysToReview")).toBe("—");
    expect(kpi("medianDaysToReview").textContent).toContain("No completed reviews in this period");
    expect(kpi("overdueReferrals").querySelector("p")?.textContent).toBe("0");
    expect(within(kpi("overdueReferrals")).getByTestId("none-overdue").textContent).toBe(
      "None past due date",
    );
    expect(screen.getByTestId("aging-buckets").textContent).toContain("No reviews pending");
  });

  it("no element labels pending reviews as overdue (EN and RW)", async () => {
    const user = userEvent.setup();
    await openTimeliness();
    const pendingText = () =>
      [screen.getByTestId("aging-buckets"), kpi("reviewsPending")]
        .map((el) => el.textContent ?? "")
        .join(" ");
    expect(pendingText()).not.toMatch(/overdue|past due/i);
    expect(pendingText()).toContain("No approved review target");
    await user.click(screen.getByRole("button", { name: "Ikinyarwanda" }));
    await waitFor(() => expect(pendingText()).toContain("Nta ntego y'isuzuma yemejwe"));
    expect(pendingText()).not.toMatch(/rengeje/i);
  });
});
