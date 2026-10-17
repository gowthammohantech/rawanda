/**
 * `/admin/funnel` (ADM-03 §9): stage counts equal the overview KPIs for the same filters and are
 * non-increasing, the LARGEST DROP pill and the dismissed branch (= the seeded District Alpha
 * dismissals for the District Alpha analyst), stage links keep the filters, and the programme
 * actions card: status changes, conflict (nothing overwritten until the user chooses), cancel
 * with reason.
 */
import { computeFunnel, countDismissed, kigaliDate } from "@laif/analytics";
import type { ProgrammeAction } from "@laif/contracts";
import { DISTRICT_IDS, FACILITY_IDS, PERSONA_IDS } from "@laif/mock-data";
import { readStoreCollection } from "@laif/test-utils";
import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";

import type { AppServices } from "../../app/services.ts";
import { DEFAULT_FILTERS, resolvePeriod } from "../../features/filters/filterSchema.ts";
import { loadMetricsDataset } from "../../features/metrics/loadMetricsDataset.ts";
import { selectOverview } from "../../features/metrics/selectOverview.ts";
import { auditEvents, bootApp } from "../../test/app.tsx";

async function openFunnel(path = "/admin/funnel", personaId: string = PERSONA_IDS.leadProgramme) {
  const result = await bootApp({ path, signInAs: personaId, strict: true });
  await screen.findByTestId("funnel-bars", {}, { timeout: 15_000 });
  return result;
}

async function dataset(services: AppServices, district: string | null) {
  const { persona, grant } = services.session.getState();
  if (persona === null) throw new Error("no persona");
  const filters = { ...DEFAULT_FILTERS, district };
  const period = resolvePeriod(filters, kigaliDate(services.clock.now()));
  return (await loadMetricsDataset(services.repo, { persona, grant }, filters, period)).dataset;
}

const stageNumber = (id: string): number => {
  const link = screen.getByTestId(`funnel-stage-${id}`);
  const value = link.querySelector(".text-lg")?.textContent ?? "";
  return Number(value.replace(/[^\d]/g, ""));
};

describe("FunnelPage", () => {
  it("stage counts equal the overview KPIs (same filters) and never increase", async () => {
    const { services } = await openFunnel();
    const ds = await dataset(services, null);
    const overview = selectOverview(ds, 5);
    expect(stageNumber("recorded")).toBe(overview.totals.screened.value);
    expect(stageNumber("flagged")).toBe(overview.totals.flagged.value);
    expect(stageNumber("reviewed")).toBe(overview.totals.reviewed.value);
    expect(stageNumber("referred")).toBe(overview.totals.referred.value);
    expect(stageNumber("completed")).toBe(overview.totals.followUpCompleted.value);
    const counts = ["recorded", "flagged", "reviewed", "referred", "completed"].map(stageNumber);
    expect(counts).toEqual(computeFunnel(ds).stages.map((s) => s.n));
    for (let i = 1; i < counts.length; i += 1) {
      expect(counts[i]).toBeLessThanOrEqual(counts[i - 1] as number);
    }
    // Exactly one LARGEST DROP pill, phrased as the derived fact.
    const pills = screen.getAllByTestId("largest-drop");
    expect(pills).toHaveLength(1);
    expect(pills[0]?.textContent).toMatch(/^LARGEST DROP · \d+% of previous$/);
    // The dismissed branch sits under Reviewed and is labelled as closed.
    const branch = screen.getByTestId("funnel-dismissed");
    expect(branch.textContent).toContain("Dismissed with reason");
    expect(branch.textContent).toContain("CLOSED WITH REASON");
    expect(screen.getByTestId("funnel-evidence").textContent).toContain(
      "of reviews with action recorded",
    );
  });

  it("District Alpha analyst: the dismissed branch equals the seeded Alpha dismissals", async () => {
    const { services, store } = await openFunnel("/admin/funnel", PERSONA_IDS.analystAlpha);
    const ds = await dataset(services, DISTRICT_IDS.alpha);
    const reviews = await readStoreCollection<{ status: string; screeningId: string }>(
      store,
      "reviews",
    );
    const inCohort = new Set(ds.cohort.screenings.map((s) => s.id as string));
    const naive = new Set(
      reviews
        .filter((r) => r.status === "dismissed_with_reason" && inCohort.has(r.screeningId))
        .map((r) => r.screeningId),
    );
    expect(naive.size).toBeGreaterThan(4);
    expect(countDismissed(ds)).toBe(naive.size);
    const branch = screen.getByTestId("funnel-dismissed");
    expect(branch.textContent).toContain(String(naive.size));
    expect(branch.querySelector('[data-suppressed="true"]')).toBeNull();
  });

  it("stage rows link to the drill-down and keep the filters", async () => {
    const user = userEvent.setup();
    const { router } = await openFunnel("/admin/funnel?preset=30d");
    const reviewed = screen.getByTestId("funnel-stage-reviewed");
    expect(reviewed.getAttribute("href")).toBe("/admin/funnel/reviewed?preset=30d");
    await user.click(reviewed);
    await waitFor(() =>
      expect(router.state.location.pathname + router.state.location.search).toBe(
        "/admin/funnel/reviewed?preset=30d",
      ),
    );
    await screen.findByTestId("stage-breakdown", {}, { timeout: 15_000 });
  });

  it("programme actions card: start, conflict (nothing overwritten until chosen), re-apply", async () => {
    const user = userEvent.setup();
    const { services, store } = await openFunnel("/admin/funnel", PERSONA_IDS.analystAlpha);
    expect(await screen.findByText("No programme actions yet")).toBeTruthy();
    const created = await services.repo.createProgrammeAction(
      {
        facilityId: FACILITY_IDS.alpha2,
        category: "data_completeness_check",
        title: "Check review completeness",
        note: "",
        dueDate: "2026-10-28",
        sourceContext: { page: "funnel", filters: {} },
      },
      crypto.randomUUID(),
    );
    await services.queryClient.invalidateQueries();
    const item = await screen.findByTestId(`programme-action-${created.data.id}`);
    expect(item.textContent).toContain("Open");
    await user.click(within(item).getByRole("button", { name: "Start" }));
    await waitFor(() => expect(item.textContent).toContain("In progress"));

    // Arm the demo `conflict` fault, then Mark done → ConflictNotice; nothing saved.
    await user.click(
      within(item).getByRole("button", { name: "Demo: make the next update conflict" }),
    );
    await user.click(await within(item).findByRole("button", { name: "Mark done" }));
    const notice = await within(item).findByRole("region", {
      name: "This action was changed by someone else",
    });
    expect(notice.textContent).toContain("Done");
    expect(notice.textContent).toContain("In progress");
    const stored = async () =>
      (await readStoreCollection<ProgrammeAction>(store, "programmeActions"))[0];
    expect(await stored()).toMatchObject({ status: "in_progress", version: 2 });

    await user.click(within(notice).getByRole("button", { name: /Re-apply my change/ }));
    await waitFor(async () => expect(await stored()).toMatchObject({ status: "done", version: 3 }));
    await waitFor(() => expect(item.textContent).toContain("Done"));
    const changes = await auditEvents(store, "admin.programme_action.status_changed");
    expect(changes.at(-1)?.changeSummary).toMatchObject({ toStatus: "done", reapplied: true });
    await waitFor(async () =>
      expect((await auditEvents(store, "conflict.resolved")).at(-1)).toMatchObject({
        entityType: "programme_action",
        entityId: created.data.id,
        changeSummary: { resolution: "reapply_on_latest" },
      }),
    );
  });

  it("conflict → Use latest keeps the stored version; cancel needs a reason", async () => {
    const user = userEvent.setup();
    const { services, store } = await openFunnel("/admin/funnel", PERSONA_IDS.analystAlpha);
    const created = await services.repo.createProgrammeAction(
      {
        facilityId: FACILITY_IDS.alpha1,
        category: "supervision_visit",
        title: "Supervision visit planning",
        note: "",
        dueDate: "2026-10-30",
        sourceContext: { page: "funnel", filters: {} },
      },
      crypto.randomUUID(),
    );
    await services.queryClient.invalidateQueries();
    const item = await screen.findByTestId(`programme-action-${created.data.id}`);
    await waitFor(() => expect(item.textContent).toContain("Open"));
    // Another user starts it meanwhile (simulated external edit → version 2); the card still
    // shows the version it read (open, v1).
    await services.repo.demo.simulateExternalUpdate(
      "programme_action",
      created.data.id,
      { status: "in_progress" },
      PERSONA_IDS.leadProgramme,
    );
    await user.click(within(item).getByRole("button", { name: "Start" }));
    const notice = await within(item).findByRole("region", {
      name: "This action was changed by someone else",
    });
    expect(
      (await readStoreCollection<ProgrammeAction>(store, "programmeActions"))[0],
    ).toMatchObject({ status: "in_progress", version: 2 });
    await user.click(within(notice).getByRole("button", { name: "Keep the latest version" }));
    await waitFor(() =>
      expect(within(item).queryByRole("region", { name: /changed by someone else/ })).toBeNull(),
    );
    await waitFor(async () =>
      expect((await auditEvents(store, "conflict.resolved")).at(-1)?.changeSummary).toMatchObject({
        resolution: "keep_latest",
      }),
    );
    await waitFor(() => expect(item.textContent).toContain("In progress"));
    // Still version 2: "Use latest" wrote nothing.
    expect(
      (await readStoreCollection<ProgrammeAction>(store, "programmeActions"))[0],
    ).toMatchObject({ version: 2 });

    await user.click(within(item).getByRole("button", { name: "Cancel" }));
    const dialog = await screen.findByRole("dialog");
    const confirm = within(dialog).getByRole("button", { name: "Cancel action" });
    expect((confirm as HTMLButtonElement).disabled).toBe(true);
    await user.type(within(dialog).getByLabelText("Reason for cancelling"), "short");
    expect((confirm as HTMLButtonElement).disabled).toBe(true);
    await user.type(within(dialog).getByLabelText("Reason for cancelling"), " but now long enough");
    await user.click(confirm);
    await waitFor(async () =>
      expect(
        (await readStoreCollection<ProgrammeAction>(store, "programmeActions"))[0],
      ).toMatchObject({
        status: "cancelled_with_reason",
        statusReason: "short but now long enough",
      }),
    );
  });
});
