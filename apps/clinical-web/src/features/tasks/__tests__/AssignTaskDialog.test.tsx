/**
 * CLN-09 AssignTaskDialog on the real app: the worker select lists ONLY the authorised CHWs of the
 * active facility (with their load), reassign without a reason is rejected (FND-03 `Reason`),
 * with a reason the history keeps both assignees; the repository itself rejects a worker of
 * another facility (`FORBIDDEN` / `WORKER_NOT_AUTHORISED`), and a double click writes once.
 */
import type { FollowUp } from "@laif/domain";
import { FACILITY_IDS, PERSONA_IDS, SEED_ANCHORS } from "@laif/mock-data";
import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";

import { routes } from "../../../app/routes.ts";
import { auditEvents, renderApp } from "../../../test/render-app.tsx";

const CLINICIAN = { personaId: PERSONA_IDS.clinAlpha1, facilityId: FACILITY_IDS.alpha1 };
const WF02 = SEED_ANCHORS.WF02_FOLLOWUP_CONFLICT;

async function openReassign() {
  const user = userEvent.setup();
  const app = await renderApp({ path: routes.tasks({ id: WF02.followUpId }), signIn: CLINICIAN });
  const drawer = await screen.findByTestId("task-drawer");
  await user.click(await within(drawer).findByTestId("task-action-reassign"));
  const dialog = await screen.findByRole("dialog", { name: "Reassign task" });
  return { user, dialog, ...app };
}

describe("AssignTaskDialog", () => {
  it("lists only authorised workers of the active facility (minus the current assignee)", async () => {
    const { dialog, services } = await openReassign();
    const select = await within(dialog).findByLabelText<HTMLSelectElement>(/^Health worker/);
    const values = [...select.options].map((o) => o.value).filter((v) => v !== "");
    const authorised = (await services.repo.listWorkers(FACILITY_IDS.alpha1)).map((w) => w.id);
    expect(values.length).toBeGreaterThan(0);
    for (const value of values) expect(authorised).toContain(value);
    expect(values).not.toContain(WF02.personaId);
    expect(values).not.toContain(PERSONA_IDS.chwBeta1A);
    expect(values).not.toContain(PERSONA_IDS.chwAlpha2A);
    // Each option shows the worker's current load.
    expect([...select.options].some((o) => /\d+ open, \d+ overdue/u.test(o.text))).toBe(true);
  });

  it("reassign needs a reason; with one, the history keeps both assignees (one write)", async () => {
    const { user, dialog, store } = await openReassign();
    const baseline = (await auditEvents(store, "followup.reassigned")).length;
    await user.selectOptions(
      await within(dialog).findByLabelText(/^Health worker/),
      PERSONA_IDS.chwAlpha1B,
    );
    const confirm = within(dialog).getByRole("button", { name: "Reassign" });
    await user.click(confirm);
    const reason = within(dialog).getByLabelText(/^Reason for reassigning/);
    await waitFor(() => expect(reason.getAttribute("aria-invalid")).toBe("true"));
    expect(await auditEvents(store, "followup.reassigned")).toHaveLength(baseline);

    await user.type(reason, "Worker on leave this week.");
    await user.dblClick(confirm);
    await screen.findByText(/^Task reassigned to/u);
    const fu = (await store.getAll<FollowUp>("followUps")).find((f) => f.id === WF02.followUpId)!;
    expect(fu.assignedWorkerId).toBe(PERSONA_IDS.chwAlpha1B);
    const workers = fu.assignmentHistory.map((h) => h.workerId);
    expect(workers).toContain(WF02.personaId);
    expect(workers.at(-1)).toBe(PERSONA_IDS.chwAlpha1B);
    expect(fu.assignmentHistory.at(-1)?.reason).toBe("Worker on leave this week.");
    const events = await auditEvents(store, "followup.reassigned");
    expect(events).toHaveLength(baseline + 1);
    expect(events.some((e) => e.justification === "Worker on leave this week.")).toBe(true);
    // The drawer timeline now names both assignees.
    const timeline = await screen.findByTestId("task-timeline");
    await waitFor(() => expect(timeline.textContent).toMatch(/Assigned to/u));
  });

  it("the repository rejects a worker of another facility", async () => {
    const { services, store } = await renderApp({ path: routes.tasks(), signIn: CLINICIAN });
    const fu = (await store.getAll<FollowUp>("followUps")).find((f) => f.id === WF02.followUpId)!;
    await expect(
      services.repo.updateFollowUp(
        {
          followUpId: fu.id,
          expectedVersion: fu.version,
          action: "reassign",
          assignedWorkerId: PERSONA_IDS.chwBeta1A,
          reason: "Trying another facility worker.",
        },
        crypto.randomUUID(),
      ),
    ).rejects.toMatchObject({ code: "FORBIDDEN", reason: "WORKER_NOT_AUTHORISED" });
  });
});
