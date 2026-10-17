/**
 * CLN-08 completion with evidence on the real app (memory store, StrictMode): an empty submit
 * shows field errors and persists nothing; with evidence → confirm (irreversible) → COMPLETED,
 * evidence visible in the drawer, the referral leaves the Overdue tab (no stored "overdue");
 * a double click on Confirm writes ONE `referral.transitioned`; a stale version → conflict panel,
 * nothing overwritten; timeout → values kept, same-key retry completes once.
 */
import type { AuditEvent, Referral } from "@laif/domain";
import { FACILITY_IDS, PERSONA_IDS, SEED_ANCHORS } from "@laif/mock-data";
import type { StoreAdapter } from "@laif/repositories";
import { screen, waitFor, within } from "@testing-library/react";
import userEvent, { type UserEvent } from "@testing-library/user-event";
import { describe, expect, it } from "vitest";

import { routes } from "../../../app/routes.ts";
import { auditEvents, renderApp } from "../../../test/render-app.tsx";

const CLINICIAN = { personaId: PERSONA_IDS.clinAlpha1, facilityId: FACILITY_IDS.alpha1 };
const OVERDUE = SEED_ANCHORS.OVERDUE_REFERRAL;

async function stored(store: StoreAdapter): Promise<Referral> {
  return (await store.getAll<Referral>("referrals")).find(
    (r) => r.id === OVERDUE.referralId,
  ) as Referral;
}

async function completions(store: StoreAdapter): Promise<AuditEvent[]> {
  return (await auditEvents(store, "referral.transitioned")).filter(
    (e) =>
      e.entityId === OVERDUE.referralId &&
      (e.changeSummary as { to?: string } | null)?.to === "completed",
  );
}

async function openComplete(user: UserEvent) {
  const app = await renderApp({
    path: routes.referrals({ tab: "overdue", id: OVERDUE.referralId }),
    signIn: CLINICIAN,
  });
  const drawer = await screen.findByTestId("referral-drawer");
  await user.click(await within(drawer).findByTestId("referral-action-complete"));
  const dialog = await screen.findByRole("dialog", { name: "Complete referral with evidence" });
  return { ...app, drawer, dialog };
}

async function fillEvidence(user: UserEvent, dialog: HTMLElement) {
  await user.type(within(dialog).getByLabelText(/^Completed at/), "2026-10-14T07:30");
  await user.selectOptions(
    within(dialog).getByRole("combobox", { name: /^Outcome/ }),
    "attended_seen",
  );
  await user.selectOptions(
    within(dialog).getByRole("combobox", { name: /^Evidence type/ }),
    "facility_attendance_record",
  );
  await user.type(
    within(dialog).getByRole("textbox", { name: /^Evidence reference/ }),
    "REG-2026-0142",
  );
}

describe("CompleteReferralDialog", () => {
  it("states that a reminder is not evidence; empty submit → field errors, nothing saved", async () => {
    const user = userEvent.setup();
    const { dialog, store } = await openComplete(user);
    expect(
      within(dialog).getByText("A reminder or message being sent is not evidence of completion."),
    ).toBeTruthy();
    const before = await stored(store);
    await user.click(within(dialog).getByRole("button", { name: "Review and complete" }));
    expect(await within(dialog).findAllByText("This field is required.")).toHaveLength(2);
    expect(within(dialog).getAllByText(/evidence/iu).length).toBeGreaterThan(0);
    const after = await stored(store);
    expect(after.version).toBe(before.version);
    expect(after.status).toBe("scheduled");
    expect(await completions(store)).toHaveLength(0);
  });

  it("with evidence → confirm; double click = ONE event; evidence shown; leaves Overdue", async () => {
    const user = userEvent.setup();
    const { dialog, drawer, store, services } = await openComplete(user);
    const overdueBefore = (await services.repo.countReferrals({}))["overdue"] ?? 0;
    await fillEvidence(user, dialog);
    await user.click(within(dialog).getByRole("button", { name: "Review and complete" }));
    const confirm = await screen.findByTestId("complete-confirm");
    expect(within(confirm).getByText("REG-2026-0142")).toBeTruthy();
    await user.dblClick(screen.getByRole("button", { name: "Confirm completion" }));

    await waitFor(() => expect(screen.queryByTestId("complete-confirm")).toBeNull());
    expect(await screen.findByText("Referral completed with evidence")).toBeTruthy();
    expect(await completions(store)).toHaveLength(1);
    const saved = await stored(store);
    expect(saved.status).toBe("completed");
    expect(saved.completionEvidence).toMatchObject({
      type: "facility_attendance_record",
      reference: "REG-2026-0142",
      outcome: "attended_seen",
      recordedBy: PERSONA_IDS.clinAlpha1,
    });
    expect(Object.values(saved)).not.toContain("overdue");

    const evidence = await within(drawer).findByTestId("referral-evidence");
    expect(within(evidence).getByText("REG-2026-0142")).toBeTruthy();
    expect(within(evidence).getByText("Facility attendance record")).toBeTruthy();
    await waitFor(() =>
      expect(within(drawer).getByTestId("referral-stepper").getAttribute("data-status")).toBe(
        "completed",
      ),
    );
    expect(within(drawer).queryByTestId("referral-overdue")).toBeNull();
    expect((await services.repo.countReferrals({}))["overdue"]).toBe(overdueBefore - 1);
    // Close the drawer: the Overdue tab no longer lists it and its badge dropped by one.
    await user.keyboard("{Escape}");
    await waitFor(() => expect(screen.queryByTestId("referral-drawer")).toBeNull());
    const overdueTab = screen.getByRole("tab", { name: /^Overdue/ });
    await waitFor(() => expect(overdueTab.textContent).toContain(String(overdueBefore - 1)));
    expect(screen.queryAllByRole("button", { name: /^Open referral for/ }).length).toBe(
      overdueBefore - 1,
    );
  });

  it("conflict on the next write → conflict panel, nothing overwritten; reload then completes", async () => {
    const user = userEvent.setup();
    const { dialog, store, services } = await openComplete(user);
    await services.repo.demo.setFaults({
      conflictOnce: [{ entityType: "referral", entityId: OVERDUE.referralId }],
    });
    await fillEvidence(user, dialog);
    await user.click(within(dialog).getByRole("button", { name: "Review and complete" }));
    await user.click(await screen.findByRole("button", { name: "Confirm completion" }));
    const panel = await screen.findByTestId("conflict-panel");
    expect(within(panel).getByText("This referral changed since you opened it")).toBeTruthy();
    expect((await stored(store)).status).toBe("scheduled");
    expect(await completions(store)).toHaveLength(0);
    expect(await auditEvents(store, "conflict.detected")).not.toHaveLength(0);

    await user.click(within(panel).getByRole("button", { name: /Reload|latest/iu }));
    // Back on the evidence form with the values kept; complete on the latest version.
    const form = await screen.findByTestId("complete-form");
    expect(
      within(form).getByRole<HTMLInputElement>("textbox", { name: /^Evidence reference/ }).value,
    ).toBe("REG-2026-0142");
    await user.click(screen.getByRole("button", { name: "Review and complete" }));
    await user.click(await screen.findByRole("button", { name: "Confirm completion" }));
    await waitFor(() => expect(screen.queryByTestId("complete-confirm")).toBeNull());
    expect(await completions(store)).toHaveLength(1);
  });

  it("timeout → values kept; retry re-sends the same key (one completion)", async () => {
    const user = userEvent.setup();
    const { dialog, store, services } = await openComplete(user);
    await services.repo.demo.setFaults({ timeoutRate: 1 });
    await fillEvidence(user, dialog);
    await user.click(within(dialog).getByRole("button", { name: "Review and complete" }));
    await user.click(await screen.findByRole("button", { name: "Confirm completion" }));
    const failed = await screen.findByTestId("referral-dialog-failed");
    await services.repo.demo.setFaults({ timeoutRate: 0 });
    await user.click(within(failed).getByRole("button", { name: "Try again" }));
    await waitFor(() => expect(screen.queryByTestId("complete-confirm")).toBeNull());
    expect(await completions(store)).toHaveLength(1);
    expect((await stored(store)).status).toBe("completed");
  });
});
