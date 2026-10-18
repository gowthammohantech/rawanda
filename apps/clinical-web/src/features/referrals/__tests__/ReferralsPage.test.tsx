/**
 * CLN-08 referrals page on the real app (memory store, StrictMode): tab counts == rows for every
 * tab (same filter as `countReferrals`), derived overdue label, URL `?id=` drawer (+ one
 * `referral.viewed`), WF-01 referral at CREATED with linked patient + review, cancelled referral
 * reason + actor, sidebar overdue badge, out-of-scope id denied (audited), one open referral per
 * review (`REFERRAL_ALREADY_OPEN`), edit with reason keeps the previous values in history.
 */
import type { Referral, Review } from "@laif/domain";
import { FACILITY_IDS, PERSONA_IDS, SEED_ANCHORS } from "@laif/mock-data";
import { createMemoryStoreAdapter, type StoreAdapter } from "@laif/repositories";
import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";

import { routes } from "../../../app/routes.ts";
import { auditEvents, renderApp } from "../../../test/render-app.tsx";
import { createTestClinicalRepo } from "../../../test/test-repository.ts";
import { REFERRAL_TABS, tabCount } from "../model.ts";

const CLINICIAN = { personaId: PERSONA_IDS.clinAlpha1, facilityId: FACILITY_IDS.alpha1 };
const COORDINATOR_A2 = { personaId: PERSONA_IDS.coordAlpha, facilityId: FACILITY_IDS.alpha2 };
const OVERDUE = SEED_ANCHORS.OVERDUE_REFERRAL;
const CANCELLED = SEED_ANCHORS.CANCELLED_REFERRAL;
const OUT_OF_SCOPE = SEED_ANCHORS.COMPLETED_REFERRAL_WITH_EVIDENCE;
const WF01 = SEED_ANCHORS.WF01_FLAGGED_REVIEW;

const TAB_LABEL = {
  open: "Open",
  overdue: "Overdue",
  completed: "Completed",
  cancelled: "Cancelled",
  all: "All",
} as const;

async function referralIn(store: StoreAdapter, id: string): Promise<Referral> {
  return (await store.getAll<Referral>("referrals")).find((r) => r.id === id) as Referral;
}

/** Cancelled referrals visible in Alpha-2, in list order (dueAt, then id). */
async function referralsInTab(store: StoreAdapter): Promise<Referral[]> {
  const { repo } = await createTestClinicalRepo(COORDINATOR_A2, store);
  return (await repo.listReferrals({ statuses: ["cancelled_with_reason"], pageSize: 200 })).items;
}

const tableRows = () =>
  within(screen.getByTestId("referral-table"))
    .queryAllByRole("row")
    .filter((row) => within(row).queryAllByRole("rowheader").length > 0);

describe("ReferralsPage", () => {
  it("every tab count equals its rows; overdue rows carry the derived label", async () => {
    const user = userEvent.setup();
    const { services } = await renderApp({ path: routes.referrals(), signIn: CLINICIAN });
    await screen.findByTestId("referral-table");
    const counts = await services.repo.countReferrals({});
    for (const tab of REFERRAL_TABS) {
      const trigger = screen.getByRole("tab", { name: new RegExp(`^${TAB_LABEL[tab]}`) });
      await user.click(trigger);
      await waitFor(() => expect(trigger.getAttribute("aria-selected")).toBe("true"));
      const expected = tabCount(counts, tab);
      expect(trigger.textContent).toContain(String(expected));
      await waitFor(() => expect(tableRows()).toHaveLength(expected));
      if (tab === "overdue") {
        expect(expected).toBeGreaterThan(0);
        expect(screen.getAllByTestId("referral-overdue")).toHaveLength(expected);
        expect(screen.getAllByText(/^Overdue — due .+ \(derived\)$/u).length).toBe(expected);
      }
    }
    // Sidebar badge = open overdue referrals.
    const nav = screen.getByRole("link", { name: /^Referrals/ });
    expect(nav.textContent).toContain(String(tabCount(counts, "overdue")));
  });

  it("?id= opens the drawer on the overdue referral with stepper and one referral.viewed", async () => {
    const { store } = await renderApp({
      path: routes.referrals({ tab: "overdue", id: OVERDUE.referralId }),
      signIn: CLINICIAN,
    });
    const drawer = await screen.findByTestId("referral-drawer");
    const stepper = await within(drawer).findByTestId("referral-stepper");
    expect(stepper.getAttribute("data-status")).toBe("scheduled");
    expect(within(drawer).getByTestId("referral-overdue")).toBeTruthy();
    expect(within(drawer).getByTestId("referral-action-complete")).toBeTruthy();
    expect(within(drawer).getByTestId("referral-action-cancel")).toBeTruthy();
    // Only legal next transitions: no accept / schedule from `scheduled`.
    expect(within(drawer).queryByTestId("referral-action-accept")).toBeNull();
    expect(within(drawer).queryByTestId("referral-action-schedule")).toBeNull();
    await waitFor(async () =>
      expect(
        (await auditEvents(store, "referral.viewed")).filter(
          (e) => e.entityId === OVERDUE.referralId,
        ),
      ).toHaveLength(1),
    );
  });

  it("WF-01 referral from the CLN-07 decision shows CREATED with linked patient + review", async () => {
    const store = createMemoryStoreAdapter();
    const { repo } = await createTestClinicalRepo(CLINICIAN, store);
    const review = (await store.getAll<Review>("reviews")).find((r) => r.id === WF01.reviewId)!;
    await repo.decideReview(
      {
        kind: "refer",
        reviewId: review.id,
        expectedVersion: review.version,
        destinationFacilityId: FACILITY_IDS.alpha2,
        referralReason: "Readings above the demo rule threshold.",
        priority: "routine",
        dueAt: "2026-10-21T07:30:00.000Z",
      },
      crypto.randomUUID(),
    );
    const created = (await store.getAll<Referral>("referrals")).find(
      (r) => r.reviewId === WF01.reviewId,
    )!;
    await renderApp({ path: routes.referrals({ id: created.id }), signIn: CLINICIAN, store });
    const drawer = await screen.findByTestId("referral-drawer");
    const stepper = await within(drawer).findByTestId("referral-stepper");
    const current = stepper.querySelector('[aria-current="step"]');
    expect(current?.textContent).toContain("Created");
    expect(within(drawer).getByTestId("referral-action-accept")).toBeTruthy();
    const linked = within(drawer).getByTestId("referral-linked-review");
    expect(within(linked).getByRole("link", { name: "Open review" }).getAttribute("href")).toBe(
      routes.review(WF01.reviewId),
    );
    await waitFor(() => expect(within(linked).getByText(/Refer — decided by/u)).toBeTruthy());
    const patientLink = within(drawer)
      .getAllByRole("link")
      .find((a) => a.getAttribute("href") === routes.patient(WF01.patientId, "referralsTasks"));
    expect(patientLink).toBeTruthy();
  });

  it("CANCELLED_REFERRAL shows its reason and actor (coordinator, Alpha-2)", async () => {
    const user = userEvent.setup();
    const { store } = await renderApp({
      path: routes.referrals({ tab: "cancelled" }),
      signIn: COORDINATOR_A2,
    });
    await screen.findByTestId("referral-table");
    await waitFor(() => expect(tableRows().length).toBeGreaterThan(0));
    const stored = await referralIn(store, CANCELLED.referralId);
    expect(stored.status).toBe("cancelled_with_reason");
    const statuses = screen.getAllByTestId("referral-status").map((s) => s.dataset["status"]);
    expect(statuses.every((s) => s === "cancelled_with_reason")).toBe(true);
    // Open the drawer from the row of the anchor (rows are ordered by due date).
    const index = (await referralsInTab(store)).findIndex((r) => r.id === CANCELLED.referralId);
    const row = tableRows()[index]!;
    await user.click(within(row).getByRole("button", { name: /^Open referral for/ }));
    const drawer = await screen.findByTestId("referral-drawer");
    expect(drawer.getAttribute("data-referral-id")).toBe(CANCELLED.referralId);
    const section = await within(drawer).findByTestId("referral-cancellation");
    expect(within(section).getByText(stored.cancelled!.reason)).toBeTruthy();
    await waitFor(() =>
      expect(within(section).getByTestId("referral-cancelled-by").textContent).toMatch(/·/u),
    );
    expect(within(drawer).getByTestId("referral-cancelled-pill")).toBeTruthy();
    expect(within(drawer).getByTestId("referral-no-actions").textContent).toContain("closed");
  });

  it("an out-of-scope ?id= shows PermissionDenied and audits access.denied", async () => {
    const { store } = await renderApp({
      path: routes.referrals({ id: OUT_OF_SCOPE.referralId }),
      signIn: CLINICIAN,
    });
    const drawer = await screen.findByTestId("referral-drawer");
    expect(await within(drawer).findByTestId("referral-denied")).toBeTruthy();
    expect(within(drawer).queryByTestId("referral-stepper")).toBeNull();
    const denied = (await auditEvents(store, "access.denied")).filter(
      (e) => e.entityId === OUT_OF_SCOPE.referralId,
    );
    expect(denied.length).toBeGreaterThan(0);
  });

  it("a second referral for the same review → REFERRAL_ALREADY_OPEN with a link", async () => {
    const user = userEvent.setup();
    const store = createMemoryStoreAdapter();
    const { repo } = await createTestClinicalRepo(CLINICIAN, store);
    const review = (await store.getAll<Review>("reviews")).find((r) => r.id === WF01.reviewId)!;
    await repo.decideReview(
      {
        kind: "no_further_action",
        reviewId: review.id,
        expectedVersion: review.version,
        note: "Assessed in clinic today.",
      },
      crypto.randomUUID(),
    );
    await renderApp({ path: routes.referrals(), signIn: CLINICIAN, store });
    await screen.findByTestId("referral-table");
    await user.click(screen.getByTestId("create-referral"));
    const dialog = await screen.findByRole("dialog", { name: "Create referral" });
    const reviewSelect = await within(dialog).findByRole("combobox", { name: /^Decided review/ });
    const option = within(reviewSelect)
      .getAllByRole<HTMLOptionElement>("option")
      .find((o) => o.value === WF01.reviewId)!;
    await user.selectOptions(reviewSelect, option);
    await user.selectOptions(
      within(dialog).getByRole("combobox", { name: /^Destination facility/ }),
      FACILITY_IDS.alpha2,
    );
    await user.type(
      within(dialog).getByRole("textbox", { name: /^Reason for referral/ }),
      "Needs a medical officer review.",
    );
    await user.selectOptions(
      within(dialog).getByRole("combobox", { name: /^Priority/ }),
      "routine",
    );
    await user.type(within(dialog).getByLabelText(/^Due date/), "2026-10-25T09:00");

    // Someone else creates a referral for the same review meanwhile.
    await repo.createReferral(
      {
        reviewId: WF01.reviewId,
        patientId: WF01.patientId,
        destinationFacilityId: FACILITY_IDS.alpha2,
        dueAt: "2026-10-25T07:00:00.000Z",
        priority: "routine",
        referralReason: "Created from another tab first.",
      },
      crypto.randomUUID(),
    );
    await user.click(within(dialog).getByRole("button", { name: "Create referral" }));
    const conflict = await within(dialog).findByTestId("referral-already-open");
    expect(within(conflict).getByRole("link", { name: "View the open referral" })).toBeTruthy();
    const open = (await store.getAll<Referral>("referrals")).filter(
      (r) => r.reviewId === WF01.reviewId && r.status !== "cancelled_with_reason",
    );
    expect(open).toHaveLength(1);
  });

  it("edit destination/due date requires a reason; previous values stay in the history", async () => {
    const user = userEvent.setup();
    const { store } = await renderApp({
      path: routes.referrals({ id: OVERDUE.referralId }),
      signIn: CLINICIAN,
    });
    const drawer = await screen.findByTestId("referral-drawer");
    const before = await referralIn(store, OVERDUE.referralId);
    await user.click(await within(drawer).findByTestId("referral-action-edit"));
    const dialog = await screen.findByRole("dialog", { name: "Change destination or due date" });
    await user.selectOptions(
      within(dialog).getByRole("combobox", { name: /^Destination facility/ }),
      FACILITY_IDS.alpha2,
    );
    await user.click(within(dialog).getByRole("button", { name: "Save change" }));
    expect(
      await within(dialog).findByText("Give a reason of at least 10 characters."),
    ).toBeTruthy();
    expect((await referralIn(store, OVERDUE.referralId)).version).toBe(before.version);

    await user.type(
      within(dialog).getByRole("textbox", { name: /^Reason for the change/ }),
      "Destination clinic has an earlier slot.",
    );
    await user.click(within(dialog).getByRole("button", { name: "Save change" }));
    await waitFor(() =>
      expect(screen.queryByRole("dialog", { name: "Change destination or due date" })).toBeNull(),
    );
    const after = await referralIn(store, OVERDUE.referralId);
    expect(after.destinationFacilityId).toBe(FACILITY_IDS.alpha2);
    const events = (await auditEvents(store, "clinical.referral.updated")).filter(
      (e) => e.entityId === OVERDUE.referralId,
    );
    expect(events).toHaveLength(1);
    expect(events[0]?.justification).toBe("Destination clinic has an earlier slot.");
    expect(events[0]?.changeSummary).toMatchObject({
      destinationFacilityId: { from: before.destinationFacilityId, to: FACILITY_IDS.alpha2 },
    });
    const history = await within(drawer).findByTestId("referral-history");
    await waitFor(() =>
      expect(within(history).getByText("Referral destination or due date changed")).toBeTruthy(),
    );
  });

  it("cancel requires a reason (≥ 10); with one → CANCELLED with reason and actor", async () => {
    const user = userEvent.setup();
    const { store } = await renderApp({
      path: routes.referrals({ id: OVERDUE.referralId }),
      signIn: CLINICIAN,
    });
    const drawer = await screen.findByTestId("referral-drawer");
    await user.click(await within(drawer).findByTestId("referral-action-cancel"));
    const dialog = await screen.findByRole("dialog", { name: "Cancel referral" });
    await user.selectOptions(
      within(dialog).getByRole("combobox", { name: /^Cancellation reason/ }),
      "patient_declined",
    );
    await user.type(within(dialog).getByRole("textbox", { name: /^Explain/ }), "short");
    await user.click(within(dialog).getByRole("button", { name: "Cancel referral" }));
    expect(
      await within(dialog).findByText("Give a reason of at least 10 characters."),
    ).toBeTruthy();
    expect((await referralIn(store, OVERDUE.referralId)).status).toBe("scheduled");

    await user.type(
      within(dialog).getByRole("textbox", { name: /^Explain/ }),
      " — patient moved away.",
    );
    await user.click(within(dialog).getByRole("button", { name: "Cancel referral" }));
    await waitFor(() =>
      expect(screen.queryByRole("dialog", { name: "Cancel referral" })).toBeNull(),
    );
    const saved = await referralIn(store, OVERDUE.referralId);
    expect(saved.status).toBe("cancelled_with_reason");
    expect(saved.cancelled).toMatchObject({ reasonCode: "patient_declined" });
    const section = await within(drawer).findByTestId("referral-cancellation");
    await waitFor(() =>
      expect(within(section).getByTestId("referral-cancelled-by").textContent).toMatch(/·/u),
    );
    expect(within(drawer).queryByTestId("referral-actions")).toBeNull();
  });

  it("accept then schedule advance the stepper (focus moves to the new step)", async () => {
    const user = userEvent.setup();
    const store = createMemoryStoreAdapter();
    const { repo } = await createTestClinicalRepo(CLINICIAN, store);
    const review = (await store.getAll<Review>("reviews")).find((r) => r.id === WF01.reviewId)!;
    await repo.decideReview(
      {
        kind: "refer",
        reviewId: review.id,
        expectedVersion: review.version,
        destinationFacilityId: FACILITY_IDS.alpha2,
        referralReason: "Readings above the demo rule threshold.",
        priority: "routine",
        dueAt: "2026-10-21T07:30:00.000Z",
      },
      crypto.randomUUID(),
    );
    const created = (await store.getAll<Referral>("referrals")).find(
      (r) => r.reviewId === WF01.reviewId,
    )!;
    await renderApp({ path: routes.referrals({ id: created.id }), signIn: CLINICIAN, store });
    const drawer = await screen.findByTestId("referral-drawer");
    await user.click(await within(drawer).findByTestId("referral-action-accept"));
    const accept = await screen.findByRole("dialog", { name: "Accept referral" });
    await user.click(within(accept).getByRole("button", { name: "Accept" }));
    await waitFor(() =>
      expect(within(drawer).getByTestId("referral-stepper").getAttribute("data-status")).toBe(
        "accepted",
      ),
    );
    await waitFor(() => expect(document.activeElement?.getAttribute("aria-current")).toBe("step"));
    expect(document.activeElement?.textContent).toContain("Accepted");

    await user.click(await within(drawer).findByTestId("referral-action-schedule"));
    const schedule = await screen.findByRole("dialog", { name: "Schedule appointment" });
    await user.click(within(schedule).getByRole("button", { name: "Schedule" }));
    expect(await within(schedule).findByText("This field is required.")).toBeTruthy();
    await user.type(within(schedule).getByLabelText(/^Appointment date/), "2026-10-20T09:00");
    await user.click(within(schedule).getByRole("button", { name: "Schedule" }));
    await waitFor(() =>
      expect(within(drawer).getByTestId("referral-stepper").getAttribute("data-status")).toBe(
        "scheduled",
      ),
    );
    expect((await referralIn(store, created.id)).appointmentAt).toBe("2026-10-20T07:00:00.000Z");
  });
});
