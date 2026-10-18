/**
 * CLN-09 ConflictResolutionDialog (WF-02 steps 3–5):
 * - standalone: "Your change" vs "Latest (by X at hh:mm)", Keep latest / Re-apply (with a merged
 *   preview before saving) / Cancel;
 * - in the app: the simulated worker bumps WF02_FOLLOWUP_CONFLICT while a reassign dialog is open
 *   on version 3 → saving conflicts (`conflict.detected`), nothing is overwritten; Keep latest and
 *   Re-apply are both audited `conflict.resolved` (resolution + original key; re-apply with a NEW
 *   key on the latest version).
 */
import type { ConflictDetails } from "@laif/contracts";
import type { FollowUp } from "@laif/domain";
import { FACILITY_IDS, PERSONA_IDS, SEED_ANCHORS } from "@laif/mock-data";
import type { StoreAdapter } from "@laif/repositories";
import { renderWithProviders } from "@laif/test-utils/web";
import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { routes } from "../../app/routes.ts";
import { auditEvents, renderApp } from "../../test/render-app.tsx";
import { personaName } from "../../features/timeline/people.ts";
import { ConflictResolutionDialog } from "../ConflictResolutionDialog.tsx";

const conflict: ConflictDetails<unknown> = {
  entityType: "follow_up",
  entityId: "fu-1",
  expectedVersion: 3,
  currentVersion: 4,
  latest: {},
  changedBy: PERSONA_IDS.chwAlpha1A,
  changedAt: "2026-10-14T06:30:00.000Z",
};
const fields = [
  {
    id: "assignee",
    label: "Assigned to",
    yours: "Worker B",
    latest: "Worker A",
    merged: "Worker B",
  },
  { id: "status", label: "Status", yours: "Assigned", latest: "Contacted", merged: "Contacted" },
];

describe("ConflictResolutionDialog", () => {
  it("compares your change with the latest and resolves explicitly", async () => {
    const user = userEvent.setup();
    const onKeepLatest = vi.fn();
    const onReapply = vi.fn();
    const onCancel = vi.fn();
    renderWithProviders(
      <ConflictResolutionDialog
        open
        conflict={conflict}
        fields={fields}
        onKeepLatest={onKeepLatest}
        onReapply={onReapply}
        onCancel={onCancel}
      />,
    );
    const dialog = await screen.findByRole("dialog", {
      name: "This task changed while you were working",
    });
    expect(within(dialog).getByText("Your change")).toBeTruthy();
    expect(within(dialog).getByTestId("conflict-latest-header").textContent).toMatch(
      new RegExp(`^Latest \\(by ${personaName(PERSONA_IDS.chwAlpha1A)} at \\d{2}:\\d{2}\\)$`, "u"),
    );
    expect(within(dialog).getByTestId("conflict-versions").textContent).toContain("version 4");

    await user.click(within(dialog).getByTestId("conflict-keep-latest"));
    expect(onKeepLatest).toHaveBeenCalledTimes(1);

    await user.click(within(dialog).getByRole("button", { name: "Re-apply my change on latest" }));
    // Merged preview first; nothing is saved until confirmed.
    const preview = await screen.findByRole("dialog", {
      name: "Re-apply your change on the latest version?",
    });
    expect(within(preview).getByTestId("conflict-preview").textContent).toContain("Contacted");
    expect(onReapply).not.toHaveBeenCalled();
    await user.click(within(preview).getByRole("button", { name: "Save on latest version" }));
    expect(onReapply).toHaveBeenCalledTimes(1);
    expect(onCancel).not.toHaveBeenCalled();
  });

  it("Cancel closes without resolving", async () => {
    const user = userEvent.setup();
    const onCancel = vi.fn();
    renderWithProviders(
      <ConflictResolutionDialog
        open
        conflict={conflict}
        fields={fields}
        onKeepLatest={vi.fn()}
        onReapply={vi.fn()}
        onCancel={onCancel}
      />,
    );
    const dialog = await screen.findByRole("dialog");
    await user.click(within(dialog).getByRole("button", { name: "Cancel" }));
    expect(onCancel).toHaveBeenCalledTimes(1);
  });
});

// ── WF-02 in the app ────────────────────────────────────────────────────────

const CLINICIAN = { personaId: PERSONA_IDS.clinAlpha1, facilityId: FACILITY_IDS.alpha1 };
const WF02 = SEED_ANCHORS.WF02_FOLLOWUP_CONFLICT;

async function staleReassign() {
  const user = userEvent.setup();
  const app = await renderApp({ path: routes.tasks({ id: WF02.followUpId }), signIn: CLINICIAN });
  const drawer = await screen.findByTestId("task-drawer");
  expect(await within(drawer).findByTestId("wf02-hint")).toBeTruthy();
  expect(within(drawer).getByTestId("task-version").textContent).toContain("3");
  await user.click(await within(drawer).findByTestId("task-action-reassign"));
  const dialog = await screen.findByRole("dialog", { name: "Reassign task" });
  await user.selectOptions(
    await within(dialog).findByLabelText(/^Health worker/),
    PERSONA_IDS.chwAlpha1B,
  );
  await user.type(
    within(dialog).getByLabelText(/^Reason for reassigning/),
    "Closer to the household this week.",
  );
  // Another actor (simulated worker) saves version 4 meanwhile.
  const current = (await app.store.getAll<FollowUp>("followUps")).find(
    (f) => f.id === WF02.followUpId,
  )!;
  await app.services.repo.demo.simulateExternalUpdate(
    "followUp",
    WF02.followUpId,
    {
      status: "contacted",
      notes: [
        ...current.notes,
        {
          at: "2026-10-14T06:10:00.000Z",
          by: PERSONA_IDS.chwAlpha1A,
          text: "Visited (simulated).",
        },
      ],
    },
    PERSONA_IDS.chwAlpha1A,
  );
  await user.click(within(dialog).getByRole("button", { name: "Reassign" }));
  const resolution = await screen.findByRole("dialog", {
    name: "This task changed while you were working",
  });
  return { user, resolution, ...app };
}

const latestFu = async (app: { store: StoreAdapter }) =>
  (await app.store.getAll<FollowUp>("followUps")).find((f) => f.id === WF02.followUpId)!;

describe("WF-02 follow-up conflict", () => {
  it("Keep latest: nothing overwritten, conflict.resolved keep_latest with the original key", async () => {
    const app = await staleReassign();
    const { user, resolution, store } = app;
    expect(within(resolution).getByTestId("conflict-latest-header").textContent).toContain(
      personaName(PERSONA_IDS.chwAlpha1A) ?? "",
    );
    // Not saved: still the worker's version 4, original assignee.
    let fu = await latestFu(app);
    expect(fu.version).toBe(4);
    expect(fu.assignedWorkerId).toBe(WF02.personaId);
    expect(
      (await auditEvents(store, "conflict.detected")).filter((e) => e.entityId === WF02.followUpId),
    ).toHaveLength(1);

    await user.click(within(resolution).getByTestId("conflict-keep-latest"));
    await screen.findByText("Kept the latest version — your change was not saved");
    const resolved = await auditEvents(store, "conflict.resolved");
    expect(resolved).toHaveLength(1);
    expect(resolved[0]?.changeSummary).toMatchObject({
      resolution: "keep_latest",
      expectedVersion: 3,
      latestVersion: 4,
    });
    expect(
      typeof (resolved[0]?.changeSummary as Record<string, unknown>)["originalIdempotencyKey"],
    ).toBe("string");
    fu = await latestFu(app);
    expect(fu.version).toBe(4);
    expect(fu.assignedWorkerId).toBe(WF02.personaId);
    // The drawer now shows the latest version.
    await waitFor(() => expect(screen.getByTestId("task-version").textContent).toContain("4"));
  });

  it("Re-apply: merged preview, saved on the latest version with a new key, audited", async () => {
    const app = await staleReassign();
    const { user, resolution, store } = app;
    await user.click(
      within(resolution).getByRole("button", { name: "Re-apply my change on latest" }),
    );
    const preview = await screen.findByRole("dialog", {
      name: "Re-apply your change on the latest version?",
    });
    await user.click(within(preview).getByRole("button", { name: "Save on latest version" }));
    await screen.findByText("Your change was saved on the latest version");
    const fu = await latestFu(app);
    expect(fu.version).toBe(5);
    expect(fu.assignedWorkerId).toBe(PERSONA_IDS.chwAlpha1B);
    // The worker's change is kept (status + note), not overwritten.
    expect(fu.status).toBe("contacted");
    expect(fu.notes.at(-1)?.text).toBe("Visited (simulated).");
    const resolved = await auditEvents(store, "conflict.resolved");
    expect(resolved).toHaveLength(1);
    const summary = resolved[0]?.changeSummary as Record<string, unknown>;
    expect(summary).toMatchObject({ resolution: "reapply_on_latest", latestVersion: 4 });
    expect(summary["newIdempotencyKey"]).not.toBe(summary["originalIdempotencyKey"]);
    expect(
      (await auditEvents(store, "followup.reassigned")).filter(
        (e) => e.justification === "Closer to the household this week.",
      ),
    ).toHaveLength(1);
  });
});
