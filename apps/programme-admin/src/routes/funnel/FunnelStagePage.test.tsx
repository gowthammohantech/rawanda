/**
 * `/admin/funnel/:stage` (ADM-03 §10): invalid stage → 404, district → facility breakdown
 * expanded by keyboard (Enter / Space), facility values reconcile to the district and stage
 * total, `admin.drilldown.viewed` emitted once per (session, stage, search) under StrictMode,
 * the auditor gets 403, the facility manager cannot assign, no patient-level data on screen.
 */
import type { Patient, Screening } from "@laif/domain";
import { DISTRICT_IDS, FACILITY_IDS, PERSONA_IDS } from "@laif/mock-data";
import { readStoreCollection } from "@laif/test-utils";
import { act, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";

import { auditEvents, bootApp } from "../../test/app.tsx";

const CHART = { width: 800, height: 240 };

async function openStage(path: string, personaId: string = PERSONA_IDS.leadProgramme) {
  const result = await bootApp({ path, signInAs: personaId, chartSize: CHART, strict: true });
  await screen.findByTestId("stage-breakdown", {}, { timeout: 15_000 });
  return result;
}

const numberIn = (el: HTMLElement, column: number): number =>
  Number((el.querySelectorAll("td")[column]?.textContent ?? "").replace(/[^\d]/g, ""));

describe("FunnelStagePage", () => {
  it("an unknown stage is a 404", async () => {
    await bootApp({ path: "/admin/funnel/triaged", signInAs: PERSONA_IDS.leadProgramme });
    expect(
      await screen.findByRole("heading", { level: 1, name: "Page not found" }, { timeout: 10_000 }),
    ).toBeTruthy();
    expect(screen.queryByTestId("funnel-stage-page")).toBeNull();
  });

  it("breadcrumb, KPI strip and keyboard expand of district rows (Enter / Space)", async () => {
    const user = userEvent.setup();
    await openStage("/admin/funnel/reviewed");
    const crumbs = screen.getByRole("navigation", { name: "Breadcrumb" });
    expect(within(crumbs).getByRole("link", { name: "Pathway funnel" }).getAttribute("href")).toBe(
      "/admin/funnel",
    );
    expect(within(crumbs).getByText("Clinically reviewed").getAttribute("aria-current")).toBe(
      "page",
    );
    expect(screen.getByTestId("kpi-stage-n").textContent).toContain("At this stage");
    expect(screen.getByTestId("kpi-stage-change").textContent).toContain("Vs previous period");

    const alphaRow = screen.getByTestId(`district-row-${DISTRICT_IDS.alpha}`);
    const toggle = within(alphaRow).getByRole("button", { name: /Demo District Alpha/ });
    expect(toggle.getAttribute("aria-expanded")).toBe("false");
    expect(screen.queryByTestId(`facility-row-${FACILITY_IDS.alpha1}`)).toBeNull();
    toggle.focus();
    await user.keyboard("{Enter}");
    expect(toggle.getAttribute("aria-expanded")).toBe("true");
    const a1 = screen.getByTestId(`facility-row-${FACILITY_IDS.alpha1}`);
    const a2 = screen.getByTestId(`facility-row-${FACILITY_IDS.alpha2}`);
    // Facility values + hidden markers reconcile to the district row (no hidden cell here).
    expect(a1.querySelector('[data-suppressed="true"]')).toBeNull();
    expect(numberIn(a1, 0) + numberIn(a2, 0)).toBe(numberIn(alphaRow, 0));
    // …and the districts to the stage total.
    const betaRow = screen.getByTestId(`district-row-${DISTRICT_IDS.beta}`);
    const total = screen.getByTestId("stage-total-row");
    expect(numberIn(alphaRow, 0) + numberIn(betaRow, 0)).toBe(numberIn(total, 0));
    expect(screen.getByTestId("kpi-stage-n").textContent).toContain(String(numberIn(total, 0)));
    await user.keyboard(" ");
    expect(toggle.getAttribute("aria-expanded")).toBe("false");
    expect(screen.queryByTestId(`facility-row-${FACILITY_IDS.alpha1}`)).toBeNull();
  });

  it("emits admin.drilldown.viewed once per (session, stage, search) under StrictMode", async () => {
    const { store, router, services } = await openStage("/admin/funnel/reviewed");
    const correlationId = services.session.getState().session?.correlationId;
    const mine = async () =>
      (await auditEvents(store, "admin.drilldown.viewed")).filter(
        (e) => e.correlationId === correlationId,
      );
    await waitFor(async () => expect(await mine()).toHaveLength(1));
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(await mine()).toHaveLength(1);
    expect((await mine())[0]).toMatchObject({
      actorId: PERSONA_IDS.leadProgramme,
      category: "access",
      changeSummary: { stage: "reviewed", search: "" },
      patientId: null,
    });
    // Same stage + search again → still one; another search → a second event.
    await act(() => router.navigate("/admin/funnel"));
    await act(() => router.navigate("/admin/funnel/reviewed"));
    await screen.findByTestId("stage-breakdown", {}, { timeout: 15_000 });
    expect(await mine()).toHaveLength(1);
    await act(() => router.navigate(`/admin/funnel/reviewed?district=${DISTRICT_IDS.alpha}`));
    await waitFor(async () => expect(await mine()).toHaveLength(2));
  });

  it("the auditor gets 403 (no metrics.drilldown) and no drill-down audit", async () => {
    const { store, services } = await bootApp({
      path: "/admin/funnel/reviewed",
      signInAs: PERSONA_IDS.auditorProgramme,
      waitFor: "forbidden-page",
    });
    expect(screen.queryByTestId("funnel-stage-page")).toBeNull();
    const correlationId = services.session.getState().session?.correlationId;
    await waitFor(async () =>
      expect(
        (await auditEvents(store, "access.denied")).filter(
          (e) => e.correlationId === correlationId,
        ),
      ).toHaveLength(1),
    );
    expect(await auditEvents(store, "admin.drilldown.viewed")).toHaveLength(0);
  });

  it("the facility manager sees the drill-down but cannot assign (reason shown)", async () => {
    const user = userEvent.setup();
    await openStage("/admin/funnel/flagged", PERSONA_IDS.fmgrAlpha1);
    await user.click(screen.getByRole("button", { name: /Demo District Alpha/ }));
    const row = await screen.findByTestId(`facility-row-${FACILITY_IDS.alpha1}`);
    await user.click(within(row).getByRole("button", { name: /Actions for/ }));
    const assign = within(row).getByRole("button", { name: "Assign programme follow-up" });
    expect(assign.getAttribute("aria-disabled")).toBe("true");
    expect(within(row).getByText("Your role cannot assign programme actions.")).toBeTruthy();
    await user.click(assign);
    expect(screen.queryByTestId("programme-action-form")).toBeNull();
  });

  it("no drill-down view shows a patient name, synthetic identifier or record id", async () => {
    const user = userEvent.setup();
    const { store } = await openStage("/admin/funnel/completed");
    for (const button of within(screen.getByTestId("stage-breakdown")).getAllByRole("button", {
      expanded: false,
    })) {
      await user.click(button);
    }
    await user.click(
      within(screen.getByTestId("chart-stage-weekly")).getByRole("button", {
        name: "View as table",
      }),
    );
    const text = screen.getByTestId("funnel-stage-page").textContent ?? "";
    const patients = await readStoreCollection<Patient>(store, "patients");
    const screenings = await readStoreCollection<Screening>(store, "screenings");
    expect(patients.length).toBeGreaterThan(10);
    for (const p of patients) {
      expect(text).not.toContain(p.displayName);
      expect(text).not.toContain(p.syntheticIdentifier);
      expect(text).not.toContain(p.id);
    }
    for (const s of screenings) expect(text).not.toContain(s.id);
    // District Beta's small completed count is hidden (<5), as in the manual check.
    const beta = screen.getByTestId(`district-row-${DISTRICT_IDS.beta}`);
    expect(beta.querySelector('[data-suppressed="true"]')).not.toBeNull();
    expect(beta.textContent).toContain("<5");
    // District Alpha (13) is hidden only so that Beta cannot be worked out from the total: it
    // reads "Hidden", never "<5" (which would be false).
    const alpha = screen.getByTestId(`district-row-${DISTRICT_IDS.alpha}`);
    const alphaN = alpha.querySelectorAll("td")[0];
    expect(alphaN?.querySelector('[data-suppressed="true"]')).not.toBeNull();
    expect(alphaN?.textContent).toContain("Hidden");
    expect(alphaN?.textContent).not.toContain("<5");
  });
});
