/**
 * CLN-09 care-team tasks page on the real app (memory store, StrictMode): every tab badge equals
 * its rows, KPI strip, workload strip (authorised workers only), sidebar badge = overdue +
 * awaiting confirmation, derived overdue label (OVERDUE_FOLLOWUP), `?id=` drawer + one
 * `followup.viewed`, WF01_WORKER_COMPLETED_FU awaiting confirmation → confirm (by = clinician),
 * return-to-worker needs a reason, UNABLE_TO_REACH_FOLLOWUP offers reassign, out-of-scope id
 * denied (audited), notes are append-only, CTZ-07 correction requests resolved with a vocabulary
 * key, and create-task (one open task per review and type).
 */
import type { CareTask, FollowUp } from "@laif/domain";
import { FACILITY_IDS, PERSONA_IDS, SEED_ANCHORS } from "@laif/mock-data";
import { createMemoryStoreAdapter, type StoreAdapter } from "@laif/repositories";
import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";

import { routes } from "../../../app/routes.ts";
import { auditEvents, renderApp } from "../../../test/render-app.tsx";
import { createTestClinicalRepo } from "../../../test/test-repository.ts";
import { personaName } from "../../timeline/people.ts";
import { TASK_TABS, matchesTab, tabCounts } from "../model.ts";

const CLINICIAN = { personaId: PERSONA_IDS.clinAlpha1, facilityId: FACILITY_IDS.alpha1 };
const NURSE_A2 = { personaId: PERSONA_IDS.nurseAlpha2, facilityId: FACILITY_IDS.alpha2 };
const WF01 = SEED_ANCHORS.WF01_WORKER_COMPLETED_FU;
const OVERDUE = SEED_ANCHORS.OVERDUE_FOLLOWUP;
const UTR = SEED_ANCHORS.UNABLE_TO_REACH_FOLLOWUP;

const TAB_LABEL = {
  dueSoon: "Due soon",
  overdue: "Overdue",
  unassigned: "Unassigned",
  unableToReach: "Unable to reach",
  awaitingConfirmation: "Awaiting confirmation",
  completed: "Completed",
} as const;

const tableRows = () =>
  within(screen.getByTestId("task-table"))
    .queryAllByRole("row")
    .filter((row) => within(row).queryAllByRole("rowheader").length > 0);

async function followUpIn(store: StoreAdapter, id: string): Promise<FollowUp> {
  return (await store.getAll<FollowUp>("followUps")).find((f) => f.id === id) as FollowUp;
}

describe("TasksPage", () => {
  it("every tab badge equals its rows; workload lists only authorised workers; sidebar badge", async () => {
    const user = userEvent.setup();
    const { services } = await renderApp({ path: routes.tasks(), signIn: CLINICIAN });
    await screen.findByTestId("task-table");
    const rows = (await services.repo.listFollowUps({ pageSize: 200 })).items;
    const now = new Date((await services.repo.demo.getDemoState()).clockIso);
    const counts = tabCounts(rows, now);
    expect(counts.overdue).toBeGreaterThan(0);
    expect(counts.awaitingConfirmation).toBeGreaterThan(0);
    for (const tab of TASK_TABS) {
      const trigger = screen.getByRole("tab", { name: new RegExp(`^${TAB_LABEL[tab]}`) });
      await user.click(trigger);
      await waitFor(() => expect(trigger.getAttribute("aria-selected")).toBe("true"));
      expect(trigger.textContent).toContain(String(counts[tab]));
      if (counts[tab] === 0) {
        expect(await screen.findByTestId("tasks-empty")).toBeTruthy();
      } else {
        await waitFor(() => expect(tableRows()).toHaveLength(counts[tab]));
      }
      if (tab === "overdue") {
        expect(screen.getAllByTestId("task-overdue")).toHaveLength(counts.overdue);
        expect(screen.getAllByText(/^Overdue — due .+ \(derived\)$/u).length).toBe(counts.overdue);
      }
    }
    // KPI strip.
    const kpis = screen.getByTestId("task-kpis");
    expect(within(kpis).getByText("Awaiting confirmation")).toBeTruthy();
    // Workload: exactly the authorised CHWs of Alpha-1.
    const workers = await services.repo.listWorkers(FACILITY_IDS.alpha1);
    const strip = await screen.findByTestId("workload-strip");
    const items = within(strip).getAllByTestId("workload-worker");
    expect(items.map((i) => i.getAttribute("data-worker-id")).sort()).toEqual(
      workers.map((w) => w.id).sort(),
    );
    expect(items.map((i) => i.getAttribute("data-worker-id"))).not.toContain(PERSONA_IDS.chwBeta1A);
    // Sidebar badge = overdue + awaiting confirmation.
    const nav = screen.getByRole("link", { name: /^Care-team tasks/ });
    await waitFor(() =>
      expect(nav.textContent).toContain(String(counts.overdue + counts.awaitingConfirmation)),
    );
  });

  it("WF01 worker completion: Awaiting confirmation → confirm sets confirmed by the clinician", async () => {
    const user = userEvent.setup();
    const { store } = await renderApp({
      path: routes.tasks({ tab: "awaitingConfirmation" }),
      signIn: CLINICIAN,
    });
    await screen.findByTestId("task-table");
    await waitFor(() => expect(tableRows().length).toBeGreaterThan(0));
    await user.click(
      screen.getByRole("button", {
        name: new RegExp(`^Open task for`),
      }),
    );
    const drawer = await screen.findByTestId("task-drawer");
    await waitFor(() => expect(drawer.getAttribute("data-followup-id")).toBe(WF01.followUpId));
    await user.click(await within(drawer).findByTestId("task-action-confirm"));
    const dialog = await screen.findByRole("dialog", { name: "Review reported completion" });
    expect(within(dialog).getByTestId("worker-outcome").textContent).toContain(
      personaName(WF01.personaId) ?? "",
    );
    await user.click(within(dialog).getByRole("button", { name: "Confirm completion" }));
    await screen.findByText("Completion confirmed");
    await waitFor(async () =>
      expect((await followUpIn(store, WF01.followUpId)).clinicianConfirmation).toMatchObject({
        status: "confirmed",
        by: PERSONA_IDS.clinAlpha1,
      }),
    );
    expect(
      (await auditEvents(store, "followup.completion_confirmed")).filter(
        (e) => e.entityId === WF01.followUpId,
      ),
    ).toHaveLength(1);
    expect(
      (await auditEvents(store, "followup.viewed")).filter((e) => e.entityId === WF01.followUpId),
    ).toHaveLength(1);
    // Moves tab: polite announcement names the Completed tab.
    expect(screen.getByTestId("tasks-announcement").textContent).toContain("Completed");
    expect(screen.getByTestId("tasks-announcement").getAttribute("aria-live")).toBe("polite");
  });

  it("return to worker requires a reason and moves the task back to contacted", async () => {
    const user = userEvent.setup();
    const { store } = await renderApp({
      path: routes.tasks({ tab: "awaitingConfirmation", id: WF01.followUpId }),
      signIn: CLINICIAN,
    });
    const drawer = await screen.findByTestId("task-drawer");
    await user.click(await within(drawer).findByTestId("task-action-confirm"));
    const dialog = await screen.findByRole("dialog", { name: "Review reported completion" });
    await user.click(within(dialog).getByTestId("return-to-worker"));
    const returning = await screen.findByRole("dialog", { name: "Return task to the worker" });
    await user.click(within(returning).getByRole("button", { name: "Return to worker" }));
    const reason = within(returning).getByLabelText(/^Reason for returning/);
    await waitFor(() => expect(reason.getAttribute("aria-invalid")).toBe("true"));
    await user.type(reason, "No attendance record attached yet.");
    await user.click(within(returning).getByRole("button", { name: "Return to worker" }));
    await screen.findByText("Task returned to the worker");
    const fu = await followUpIn(store, WF01.followUpId);
    expect(fu.status).toBe("contacted");
    expect(fu.clinicianConfirmation).toMatchObject({ status: "returned" });
  });

  it("OVERDUE_FOLLOWUP shows the derived overdue badge in the drawer", async () => {
    await renderApp({
      path: routes.tasks({ tab: "overdue", id: OVERDUE.followUpId }),
      signIn: CLINICIAN,
    });
    const drawer = await screen.findByTestId("task-drawer");
    expect(await within(drawer).findByTestId("task-overdue")).toBeTruthy();
    expect(within(drawer).getByTestId("task-status").getAttribute("data-status")).toBe("assigned");
  });

  it("UNABLE_TO_REACH_FOLLOWUP offers reassign (Alpha-2)", async () => {
    await renderApp({
      path: routes.tasks({ tab: "unableToReach", id: UTR.followUpId }),
      signIn: NURSE_A2,
    });
    const drawer = await screen.findByTestId("task-drawer");
    expect(await within(drawer).findByTestId("task-action-reassign")).toBeTruthy();
    expect(within(drawer).queryByTestId("task-action-updateStatus")).toBeNull();
  });

  it("an out-of-scope ?id= is denied and audited", async () => {
    const store = createMemoryStoreAdapter();
    const { repo } = await createTestClinicalRepo(
      { personaId: PERSONA_IDS.clinBeta1, facilityId: FACILITY_IDS.beta1 },
      store,
    );
    const other = (await repo.listFollowUps({ pageSize: 200 })).items[0]!;
    await renderApp({ path: routes.tasks({ id: other.id }), signIn: CLINICIAN, store });
    expect(await screen.findByTestId("task-denied")).toBeTruthy();
    await waitFor(async () =>
      expect(
        (await auditEvents(store, "access.denied")).filter((e) => e.entityId === other.id).length,
      ).toBeGreaterThan(0),
    );
  });

  it("adds an append-only note", async () => {
    const user = userEvent.setup();
    const { store } = await renderApp({
      path: routes.tasks({ id: OVERDUE.followUpId }),
      signIn: CLINICIAN,
    });
    const drawer = await screen.findByTestId("task-drawer");
    const before = (await followUpIn(store, OVERDUE.followUpId)).notes;
    await user.click(await within(drawer).findByTestId("task-action-note"));
    const dialog = await screen.findByRole("dialog", { name: "Add note" });
    await user.type(within(dialog).getByLabelText(/^Note/), "Called the family, no answer.");
    await user.click(within(dialog).getByRole("button", { name: "Add note" }));
    await screen.findByText("Note added");
    const after = (await followUpIn(store, OVERDUE.followUpId)).notes;
    expect(after.slice(0, before.length)).toEqual(before);
    expect(after.at(-1)).toMatchObject({
      text: "Called the family, no answer.",
      by: CLINICIAN.personaId,
    });
  });

  it("resolves a citizen correction request with a vocabulary key", async () => {
    const user = userEvent.setup();
    const { store, services } = await renderApp({ path: routes.tasks(), signIn: CLINICIAN });
    await screen.findByTestId("task-table");
    const patientId = SEED_ANCHORS.WF01_FLAGGED_REVIEW.patientId;
    const created = await services.repo.createTask(
      {
        kind: "correction_request",
        patientId,
        payload: {
          targetType: "patient",
          targetId: patientId,
          description: "My fasting status was missing.",
          suggestedValue: "Fasting",
          requestStatus: "submitted",
          assignedRole: "clinician",
        },
      },
      crypto.randomUUID(),
    );
    await services.queryClient.invalidateQueries();
    const panel = await screen.findByTestId("correction-requests");
    const text = await within(panel).findByText("My fasting status was missing.");
    const item = text.closest("li") as HTMLElement;
    expect(item.getAttribute("data-task-id")).toBe(created.data.id);
    await user.click(within(item).getByTestId("correction-start"));
    await user.click(await within(item).findByTestId("correction-resolve"));
    const dialog = await screen.findByRole("dialog", { name: "Resolve correction request" });
    await user.selectOptions(
      within(dialog).getByLabelText(/^Outcome/),
      "glucose_context_corrected",
    );
    expect(within(dialog).getByTestId("correction-citizen-status").textContent).toContain(
      "record corrected",
    );
    await user.click(within(dialog).getByRole("button", { name: "Resolve request" }));
    await screen.findByText("Correction request resolved");
    const task = (await store.getAll<CareTask>("careTasks")).find((t) => t.id === created.data.id);
    expect(task).toMatchObject({
      status: "done",
      payload: { requestStatus: "resolved_amended", resolutionKey: "glucose_context_corrected" },
    });
  });

  it("creates a task for a decided review; one open task per review and type", async () => {
    const user = userEvent.setup();
    const { services } = await renderApp({ path: routes.tasks(), signIn: CLINICIAN });
    await screen.findByTestId("task-table");
    await user.click(screen.getByTestId("create-task"));
    const dialog = await screen.findByRole("dialog", { name: "Create task" });
    const reviewSelect = await within(dialog).findByLabelText<HTMLSelectElement>(/^Decided review/);
    const reviewId = [...reviewSelect.options].find((o) => o.value !== "")!.value;
    await user.selectOptions(reviewSelect, reviewId);
    const typeSelect = within(dialog).getByLabelText<HTMLSelectElement>(/^Task type/);
    const purpose = [...typeSelect.options].find((o) => o.value !== "")!.value;
    await user.selectOptions(typeSelect, purpose);
    await user.type(within(dialog).getByLabelText(/^Due date and time/), "2026-10-28T09:00");
    await user.click(within(dialog).getByRole("button", { name: "Create task" }));
    await screen.findByText("Task created");
    const open = (await services.repo.listFollowUps({ pageSize: 200 })).items.filter(
      (f) => f.reviewId === reviewId && f.purpose === purpose && f.status !== "completed",
    );
    expect(open).toHaveLength(1);
    const now = new Date((await services.repo.demo.getDemoState()).clockIso);
    expect(matchesTab(open[0]!, "unassigned", now)).toBe(true);
  });
});
