/**
 * `/admin/workload` (ADM-05 §9–10): role variations (programme lead, auditor without the worker
 * table, facility manager limited to their facility), `admin.drilldown.viewed` once per
 * (session, filters) when the worker table renders, the PROXY pill + disclaimer in EN and RW, the
 * empty period, and an out-of-scope district → 403.
 */
import { DISTRICT_IDS, PERSONA_IDS } from "@laif/mock-data";
import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";

import { auditEvents, bootApp } from "../../test/app.tsx";

const CHART = { width: 800, height: 240 };

async function openWorkload(
  path = "/admin/workload",
  personaId: string = PERSONA_IDS.leadProgramme,
  strict = false,
) {
  const result = await bootApp({ path, signInAs: personaId, chartSize: CHART, strict });
  await screen.findByTestId("kpi-strip", {}, { timeout: 15_000 });
  return result;
}

const drilldownEvents = async (store: Parameters<typeof auditEvents>[0]) =>
  (await auditEvents(store, "admin.drilldown.viewed")).filter(
    (e) => (e.changeSummary as { view?: string } | null)?.view === "workload_worker_table",
  );

describe("WorkloadPage", () => {
  it("programme lead: eyebrow, 5 KPIs with the PROXY pill, disclaimer, one audit event", async () => {
    const { store } = await openWorkload("/admin/workload", PERSONA_IDS.leadProgramme, true);
    await screen.findByTestId("worker-table");
    expect(screen.getByText("WORKER BURDEN")).toBeTruthy();
    expect(screen.getByTestId("kpi-strip").children).toHaveLength(5);
    const minutes = screen.getByTestId("kpi-workloadMinutes");
    expect(minutes.textContent).toContain("Staff minutes per patient-day");
    expect(within(minutes).getByTestId("proxy-pill").textContent).toBe("PROXY");
    expect(within(minutes).getByTestId("kpi-index").textContent).toMatch(
      /\d[.,]\d\d× vs demo baseline/,
    );
    expect(screen.getByTestId("kpi-tasksCompleted").textContent).toMatch(/\d+% of assigned/);
    expect(screen.getByTestId("baseline-note").textContent).toContain(
      "DEMO BASELINE — not an approved baseline",
    );
    expect(screen.getByTestId("workload-disclaimer").textContent).toBe(
      "These are proxy measures from self-reported demo time entries. They describe workload, not individual performance. An approved workload measurement method is pending.",
    );
    expect(screen.getByTestId("task-status").textContent).toMatch(/Unable to reach/);
    expect(screen.getByTestId("minutes-by-activity").textContent).toContain("Travel");
    await waitFor(async () => expect(await drilldownEvents(store)).toHaveLength(1));
  });

  it("auditor: the page without the worker table (explanation instead), no drill-down audit", async () => {
    const { store } = await openWorkload("/admin/workload", PERSONA_IDS.auditorProgramme);
    expect(screen.getByTestId("no-drilldown").textContent).toContain(
      "Worker-level view requires drill-down permission",
    );
    expect(screen.queryByTestId("worker-table")).toBeNull();
    expect(screen.getByTestId("task-status")).toBeTruthy();
    expect(screen.getByTestId("chart-weekly-minutes")).toBeTruthy();
    expect(document.body.textContent).not.toMatch(/HW-\d{3}/);
    expect(await drilldownEvents(store)).toHaveLength(0);
  });

  it("facility manager: only their facility's worker codes", async () => {
    await openWorkload("/admin/workload", PERSONA_IDS.fmgrAlpha1);
    const table = within(await screen.findByTestId("worker-table")).getByRole("table");
    const rows = within(table).getAllByRole("row").slice(1);
    expect(rows.length).toBeGreaterThanOrEqual(2);
    const codes = rows.map((r) => within(r).getByRole("rowheader").textContent);
    expect(codes).toEqual(expect.arrayContaining(["HW-014", "HW-015"]));
    expect(codes).not.toContain("HW-021");
    expect(codes).not.toContain("HW-031");
    for (const r of rows) expect(r.textContent).toContain("Alpha-1");
  });

  it("empty period: 'No follow-up tasks were assigned in this period'", async () => {
    await openWorkload("/admin/workload?preset=custom&from=2025-01-01&to=2025-01-31");
    expect(screen.getByTestId("no-tasks").textContent).toContain(
      "No follow-up tasks were assigned in this period",
    );
    expect(screen.getByTestId("kpi-workloadMinutes").querySelector("p")?.textContent).toBe("—");
  });

  it("RW: the PROXY pill and the disclaimer are translated", async () => {
    const user = userEvent.setup();
    await openWorkload();
    await user.click(screen.getByRole("button", { name: "Ikinyarwanda" }));
    await waitFor(() =>
      expect(screen.getByTestId("workload-disclaimer").textContent).toContain(
        "Iyi ni imibare igereranya ivuye mu gihe abakozi biyandikiye mu igerageza.",
      ),
    );
    expect(
      within(screen.getByTestId("kpi-workloadMinutes")).getByTestId("proxy-pill").textContent,
    ).toBe("IGERERANYA");
    expect(screen.getByTestId("kpi-workloadMinutes").textContent).toContain(
      "Iminota y'umukozi ku murwayi ku munsi",
    );
  });

  it("District Alpha analyst: District Beta in the URL → 403", async () => {
    await bootApp({
      path: `/admin/workload?district=${DISTRICT_IDS.beta}`,
      signInAs: PERSONA_IDS.analystAlpha,
      waitFor: "forbidden-page",
    });
    expect(screen.queryByTestId("workload-page")).toBeNull();
  });
});
