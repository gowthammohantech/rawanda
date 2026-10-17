/**
 * CLN-07 decision page on the real repository (memory store, StrictMode):
 * - Scenario 1 (WF01): Refer → confirm (summary + attribution) → ACTION RECORDED, one referral
 *   `created` linked to patient + review, audit events share one correlation id; a double click on
 *   Confirm → still one decision / referral (T-04);
 * - Scenario 2 / WF-03: dismiss without rationale → errors; with rationale → DISMISSED WITH REASON,
 *   no referral / follow-up;
 * - timeout fault → "Not saved yet" → Retry (same key) → one decision;
 * - conflict fault → ConflictPanel, nothing overwritten; second tab decided first → conflict →
 *   reload → the existing decision read-only (T-05);
 * - draft restore prompt after a remount; submitted draft of a decided review → success, not a
 *   resubmission (T-09);
 * - repeat test: authorised CHW of the facility only → FollowUp `repeat_screening` assigned;
 * - guards: pending review → redirect to the review; coordinator → permission denied; offline →
 *   Save disabled + "Saved as draft on this browser".
 */
import type { AuditEvent, FollowUp, Referral, Review } from "@laif/domain";
import { FACILITY_IDS, PERSONA_IDS, SEED_ANCHORS } from "@laif/mock-data";
import { createMemoryStoreAdapter, type StoreAdapter } from "@laif/repositories";
import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it } from "vitest";

import { routes } from "../../../app/routes.ts";
import { auditEvents, renderApp } from "../../../test/render-app.tsx";
import { createTestClinicalRepo } from "../../../test/test-repository.ts";
import { draftStorageKey } from "../useDecisionDraft.ts";

const CLINICIAN = { personaId: PERSONA_IDS.clinAlpha1, facilityId: FACILITY_IDS.alpha1 };
const COORDINATOR = { personaId: PERSONA_IDS.coordAlpha, facilityId: FACILITY_IDS.alpha1 };
const WF01 = SEED_ANCHORS.WF01_FLAGGED_REVIEW;
const WF03 = SEED_ANCHORS.WF03_DISMISSABLE_FLAG;

type User = ReturnType<typeof userEvent.setup>;

const storedReview = async (store: StoreAdapter, id: string) =>
  (await store.get<Review>("reviews", id)) as Review;
const referralsOf = async (store: StoreAdapter, reviewId: string) =>
  (await store.getAll<Referral>("referrals")).filter((r) => r.reviewId === reviewId);
const followUpsOf = async (store: StoreAdapter, reviewId: string) =>
  (await store.getAll<FollowUp>("followUps")).filter((f) => f.reviewId === reviewId);
const forEntity = async (store: StoreAdapter, action: string, id: string) =>
  (await auditEvents(store, action)).filter((e: AuditEvent) => e.entityId === id);

/** A store where the clinician has already started `reviewId` (IN REVIEW by me). */
async function startedStore(reviewId: string) {
  const store = createMemoryStoreAdapter();
  const { repo } = await createTestClinicalRepo(CLINICIAN, store);
  const review = await storedReview(store, reviewId);
  await repo.startReview({ reviewId, expectedVersion: review.version }, crypto.randomUUID());
  return { store, repo };
}

async function openDecision(reviewId: string, store: StoreAdapter) {
  const rendered = await renderApp({ path: routes.decision(reviewId), signIn: CLINICIAN, store });
  await screen.findByTestId("decision-form");
  return rendered;
}

async function fillRefer(user: User) {
  await user.click(screen.getByRole("radio", { name: /^Refer/ }));
  await user.selectOptions(screen.getByLabelText(/^Destination facility/), FACILITY_IDS.alpha2);
  await user.type(screen.getByLabelText(/^Referral reason/), "Readings above the demo rule twice");
  await user.selectOptions(screen.getByLabelText(/^Priority/), "routine");
  fireEvent.change(screen.getByLabelText(/^Due date and time/), {
    target: { value: "2026-10-21T09:30" },
  });
}

async function fillDismiss(user: User) {
  await user.click(screen.getByRole("radio", { name: /^Dismiss flag with reason/ }));
  await user.selectOptions(screen.getByLabelText(/^Dismiss reason/), "repeat_reading_acceptable");
  await user.type(
    screen.getByLabelText(/^Rationale for dismissing/),
    "Repeat reading within the demo range",
  );
}

const confirmButton = () =>
  within(screen.getByRole("dialog")).getByRole("button", { name: "Confirm and save" });

beforeEach(() => {
  window.sessionStorage.clear();
});

describe("DecisionPage", () => {
  it("Scenario 1: refer → confirm → ACTION RECORDED, one referral, shared correlation id (double click safe)", async () => {
    const user = userEvent.setup();
    const { store } = await startedStore(WF01.reviewId);
    await openDecision(WF01.reviewId, store);
    expect(screen.getByTestId("decision-evidence").textContent).toContain(
      "DEMO_RULE_NOT_CLINICALLY_VALIDATED",
    );
    await fillRefer(user);
    await user.click(screen.getByTestId("decision-save"));

    const dialog = await screen.findByRole("dialog", { name: "Confirm decision" });
    const summary = within(dialog).getByTestId("decision-confirm");
    expect(summary.textContent).toContain("Refer");
    expect(summary.textContent).toContain(
      "A referral (status Created) to Demo Health Centre Alpha-2",
    );
    expect(summary.textContent).toContain("21 Oct 2026, 09:30");
    expect(within(dialog).getByTestId("decision-attribution").textContent).toBe(
      "Recorded by Zorvel Quorandi, Clinician, Demo Health Centre Alpha-1 at 08:00 (Kigali)",
    );

    await user.dblClick(confirmButton());
    const success = await screen.findByTestId("decision-success");
    expect(success.getAttribute("data-mode")).toBe("fresh");
    expect(within(success).getByTestId("review-status").getAttribute("data-status")).toBe(
      "action_recorded",
    );
    expect(within(success).getByTestId("success-referral").getAttribute("data-status")).toBe(
      "created",
    );
    expect(within(success).getByTestId("view-referral")).toBeTruthy();
    expect(within(success).getByTestId("back-to-queue")).toBeTruthy();
    expect((await screen.findAllByText("Decision recorded")).length).toBeGreaterThan(0);

    const saved = await storedReview(store, WF01.reviewId);
    expect(saved.status).toBe("action_recorded");
    expect(saved.decision?.kind).toBe("refer");
    expect(saved.reviewedBy).toBe(PERSONA_IDS.clinAlpha1);
    const referrals = await referralsOf(store, WF01.reviewId);
    expect(referrals).toHaveLength(1);
    expect(referrals[0]).toMatchObject({
      status: "created",
      patientId: WF01.patientId,
      reviewId: WF01.reviewId,
      destinationFacilityId: FACILITY_IDS.alpha2,
      referralReason: "Readings above the demo rule twice",
      dueAt: "2026-10-21T07:30:00.000Z",
    });
    const decided = await forEntity(store, "review.decided", WF01.reviewId);
    expect(decided).toHaveLength(1);
    const created = await forEntity(store, "referral.created", referrals[0]?.id ?? "");
    expect(created).toHaveLength(1);
    expect(created[0]?.correlationId).toBe(decided[0]?.correlationId);
    expect(window.sessionStorage.getItem(draftStorageKey(WF01.reviewId))).toBeNull();
  });

  it("Scenario 2 / WF-03: dismiss without rationale → errors; with rationale → DISMISSED, nothing created", async () => {
    const user = userEvent.setup();
    const { store } = await startedStore(WF03.reviewId);
    await openDecision(WF03.reviewId, store);
    await user.click(screen.getByRole("radio", { name: /^Dismiss flag with reason/ }));
    await user.click(screen.getByTestId("decision-save"));
    expect(await screen.findByTestId("decision-error-summary")).toBeTruthy();
    expect(screen.getAllByText("This field is required.")).toHaveLength(2);
    expect(screen.queryByRole("dialog")).toBeNull();

    await user.selectOptions(screen.getByLabelText(/^Dismiss reason/), "repeat_reading_acceptable");
    await user.type(
      screen.getByLabelText(/^Rationale for dismissing/),
      "Repeat reading within the demo range",
    );
    await user.click(screen.getByTestId("decision-save"));
    const dialog = await screen.findByRole("dialog", { name: "Confirm decision" });
    expect(within(dialog).getByTestId("decision-confirm").textContent).toContain(
      "Nothing else — no referral or task",
    );
    await user.click(confirmButton());
    const success = await screen.findByTestId("decision-success");
    expect(within(success).getByTestId("review-status").getAttribute("data-status")).toBe(
      "dismissed_with_reason",
    );
    expect(within(success).getByTestId("success-nothing-created")).toBeTruthy();

    const saved = await storedReview(store, WF03.reviewId);
    expect(saved.status).toBe("dismissed_with_reason");
    expect(saved.decision?.reasonCode).toBe("repeat_reading_acceptable");
    expect(saved.decisionReason).toBe("Repeat reading within the demo range");
    expect(await referralsOf(store, WF03.reviewId)).toHaveLength(0);
    expect(await followUpsOf(store, WF03.reviewId)).toHaveLength(0);
    expect(await forEntity(store, "review.dismissed", WF03.reviewId)).toHaveLength(1);
  });

  it("timeout fault → 'Not saved yet' → Retry with the same key → still one decision", async () => {
    const user = userEvent.setup();
    const { store } = await startedStore(WF01.reviewId);
    const { services } = await openDecision(WF01.reviewId, store);
    await fillRefer(user);
    await services.repo.demo.setFaults({ timeoutRate: 1 });
    await user.click(screen.getByTestId("decision-save"));
    await user.click(await screen.findByRole("button", { name: "Confirm and save" }));
    const banner = await screen.findByTestId("decision-not-saved");
    expect(banner.textContent).toContain("Not saved yet");
    expect(screen.queryByRole("dialog")).toBeNull();
    // Values kept.
    expect(screen.getByLabelText<HTMLTextAreaElement>(/^Referral reason/).value).toBe(
      "Readings above the demo rule twice",
    );

    await services.repo.demo.setFaults({ timeoutRate: 0 });
    await user.click(screen.getByTestId("decision-retry"));
    const success = await screen.findByTestId("decision-success");
    expect(success.getAttribute("data-mode")).toBe("replayed");
    expect(await forEntity(store, "review.decided", WF01.reviewId)).toHaveLength(1);
    expect(await referralsOf(store, WF01.reviewId)).toHaveLength(1);
  });

  it("conflict fault → ConflictPanel, nothing overwritten; reload → save succeeds", async () => {
    const user = userEvent.setup();
    const { store } = await startedStore(WF03.reviewId);
    const { services } = await openDecision(WF03.reviewId, store);
    await services.repo.demo.setFaults({
      conflictOnce: [{ entityType: "review", entityId: WF03.reviewId }],
    });
    await fillDismiss(user);
    await user.click(screen.getByTestId("decision-save"));
    await user.click(await screen.findByRole("button", { name: "Confirm and save" }));
    const panel = await screen.findByTestId("conflict-panel");
    expect(panel.textContent).toContain("This review changed since you opened it");
    expect(within(panel).getByRole("button", { name: "Discard my draft" })).toBeTruthy();
    expect(screen.getByTestId<HTMLButtonElement>("decision-save").disabled).toBe(true);
    expect((await storedReview(store, WF03.reviewId)).status).toBe("in_review");
    expect(await forEntity(store, "conflict.detected", WF03.reviewId)).toHaveLength(1);

    await user.click(within(panel).getByRole("button", { name: "Keep the latest version" }));
    await waitFor(() => expect(screen.queryByTestId("conflict-panel")).toBeNull());
    await user.click(screen.getByTestId("decision-save"));
    await user.click(await screen.findByRole("button", { name: "Confirm and save" }));
    await screen.findByTestId("decision-success");
    expect((await storedReview(store, WF03.reviewId)).status).toBe("dismissed_with_reason");
    expect(await forEntity(store, "review.dismissed", WF03.reviewId)).toHaveLength(1);
  });

  it("second tab decided first → conflict, nothing overwritten → reload shows the existing decision read-only", async () => {
    const user = userEvent.setup();
    const { store, repo } = await startedStore(WF03.reviewId);
    await openDecision(WF03.reviewId, store);
    await fillDismiss(user);

    // "Second tab": same clinician records a no-further-action decision first.
    const current = await storedReview(store, WF03.reviewId);
    await repo.decideReview(
      {
        kind: "no_further_action",
        reviewId: WF03.reviewId,
        expectedVersion: current.version,
        note: "Assessment recorded in another tab",
      },
      crypto.randomUUID(),
    );

    await user.click(screen.getByTestId("decision-save"));
    await user.click(await screen.findByRole("button", { name: "Confirm and save" }));
    const panel = await screen.findByTestId("conflict-panel");
    expect(panel.textContent).toContain("Action recorded");
    const saved = await storedReview(store, WF03.reviewId);
    expect(saved.decision?.kind).toBe("no_further_action");
    expect(await forEntity(store, "review.dismissed", WF03.reviewId)).toHaveLength(0);

    await user.click(within(panel).getByRole("button", { name: "Keep the latest version" }));
    const readOnly = await screen.findByTestId("decision-success");
    expect(readOnly.getAttribute("data-mode")).toBe("already");
    expect(readOnly.textContent).toContain("This review already has a decision");
    expect(readOnly.textContent).toContain("Assessment recorded in another tab");
    expect(screen.queryByTestId("decision-form")).toBeNull();
  });

  it("reload mid-form → 'Restore unsaved decision draft?' → restore keeps the values", async () => {
    const user = userEvent.setup();
    const { store } = await startedStore(WF03.reviewId);
    const first = await openDecision(WF03.reviewId, store);
    await fillDismiss(user);
    await waitFor(() =>
      expect(window.sessionStorage.getItem(draftStorageKey(WF03.reviewId))).toContain(
        "Repeat reading within the demo range",
      ),
    );
    const savedKey = (
      JSON.parse(window.sessionStorage.getItem(draftStorageKey(WF03.reviewId)) ?? "{}") as {
        idempotencyKey?: string;
      }
    ).idempotencyKey;
    expect(savedKey).toBeTruthy();
    first.unmount();

    await renderApp({ path: routes.decision(WF03.reviewId), signIn: CLINICIAN, store });
    const prompt = await screen.findByTestId("draft-restore");
    expect(prompt.textContent).toContain("Restore unsaved decision draft?");
    expect(screen.queryByTestId("decision-form")).toBeNull();
    await user.click(within(prompt).getByRole("button", { name: "Restore draft" }));
    expect(
      screen.getByRole<HTMLInputElement>("radio", { name: /^Dismiss flag with reason/ }).checked,
    ).toBe(true);
    expect(screen.getByLabelText<HTMLTextAreaElement>(/^Rationale for dismissing/).value).toBe(
      "Repeat reading within the demo range",
    );
    // The restored draft keeps its form-session idempotency key for the actual write.
    await user.click(screen.getByTestId("decision-save"));
    await user.click(confirmButton());
    await screen.findByTestId("decision-success");
    expect(await store.get("idempotency", savedKey ?? "")).toBeDefined();
    expect(await forEntity(store, "review.dismissed", WF03.reviewId)).toHaveLength(1);
  });

  it("discarding the draft starts an empty form", async () => {
    const user = userEvent.setup();
    const { store } = await startedStore(WF03.reviewId);
    const first = await openDecision(WF03.reviewId, store);
    await fillDismiss(user);
    await waitFor(() =>
      expect(window.sessionStorage.getItem(draftStorageKey(WF03.reviewId))).not.toBeNull(),
    );
    first.unmount();
    await renderApp({ path: routes.decision(WF03.reviewId), signIn: CLINICIAN, store });
    await user.click(await screen.findByRole("button", { name: "Discard draft" }));
    const form = await screen.findByTestId("decision-form");
    expect(
      within(form)
        .getAllByRole("radio")
        .some((r) => (r as HTMLInputElement).checked),
    ).toBe(false);
    expect(window.sessionStorage.getItem(draftStorageKey(WF03.reviewId))).toBeNull();
  });

  it("T-09: a submitted draft whose key was already processed → success state, no resubmission", async () => {
    const { store, repo } = await startedStore(WF03.reviewId);
    const current = await storedReview(store, WF03.reviewId);
    const key = crypto.randomUUID();
    const variables = {
      kind: "dismiss" as const,
      reviewId: WF03.reviewId,
      expectedVersion: current.version,
      dismissReasonCode: "duplicate_flag" as const,
      reason: "Duplicate of an earlier demo flag",
    };
    await repo.decideReview(variables, key); // committed, but the tab "reloaded" before the answer
    window.sessionStorage.setItem(
      draftStorageKey(WF03.reviewId),
      JSON.stringify({
        values: {
          kind: "dismiss",
          dismissReasonCode: "duplicate_flag",
          reason: "Duplicate of an earlier demo flag",
        },
        idempotencyKey: key,
        expectedVersion: current.version,
        submitted: variables,
      }),
    );
    await renderApp({ path: routes.decision(WF03.reviewId), signIn: CLINICIAN, store });
    const success = await screen.findByTestId("decision-success");
    expect(success.getAttribute("data-mode")).toBe("replayed");
    expect(screen.getByTestId("decision-replayed")).toBeTruthy();
    expect(await forEntity(store, "review.dismissed", WF03.reviewId)).toHaveLength(1);
    expect(window.sessionStorage.getItem(draftStorageKey(WF03.reviewId))).toBeNull();
  });

  it("repeat test: only authorised CHWs of the facility; creates an assigned repeat_screening follow-up", async () => {
    const user = userEvent.setup();
    const { store } = await startedStore(WF01.reviewId);
    await openDecision(WF01.reviewId, store);
    await user.click(screen.getByRole("radio", { name: /^Request repeat test/ }));
    const worker = await screen.findByLabelText(/^Community health worker/);
    const names = within(worker)
      .getAllByRole("option")
      .map((o) => o.textContent);
    expect(names).toEqual(["Choose a health worker", "Ixozo Texaelix", "Oxavel Oquumbra"]);
    fireEvent.change(screen.getByLabelText(/^Due date and time/), {
      target: { value: "2026-10-16T10:00" },
    });
    await user.type(
      screen.getByLabelText(/^Instructions for the health worker/),
      "Repeat both readings at the home visit",
    );
    await user.click(screen.getByTestId("decision-save"));
    expect(await screen.findByText("This field is required.")).toBeTruthy();

    await user.selectOptions(worker, PERSONA_IDS.chwAlpha1A);
    await user.click(screen.getByTestId("decision-save"));
    const dialog = await screen.findByRole("dialog", { name: "Confirm decision" });
    expect(dialog.textContent).toContain("A repeat-test task assigned to Oxavel Oquumbra");
    await user.click(confirmButton());
    const success = await screen.findByTestId("decision-success");
    expect(within(success).getByTestId("success-task").getAttribute("data-purpose")).toBe(
      "repeat_screening",
    );
    const [followUp] = await followUpsOf(store, WF01.reviewId);
    expect(followUp).toMatchObject({
      purpose: "repeat_screening",
      status: "assigned",
      assignedWorkerId: PERSONA_IDS.chwAlpha1A,
    });
    expect(await referralsOf(store, WF01.reviewId)).toHaveLength(0);
  });

  it("a pending review (not started) redirects to the review detail with a message", async () => {
    const { router } = await renderApp({
      path: routes.decision(WF01.reviewId),
      signIn: CLINICIAN,
    });
    await waitFor(() => expect(router.state.location.pathname).toBe(routes.review(WF01.reviewId)));
    expect(await screen.findByText("Start the review before recording a decision")).toBeTruthy();
  });

  it("coordinator → permission denied (route needs review.decide)", async () => {
    await renderApp({ path: routes.decision(WF01.reviewId), signIn: COORDINATOR });
    expect(await screen.findByTestId("permission-denied")).toBeTruthy();
    expect(screen.queryByTestId("decision-form")).toBeNull();
  });

  it("offline → draft kept, 'Saved as draft on this browser', Save disabled", async () => {
    const user = userEvent.setup();
    const { store } = await startedStore(WF03.reviewId);
    const { router, services } = await openDecision(WF03.reviewId, store);
    await fillDismiss(user);
    await waitFor(() =>
      expect(window.sessionStorage.getItem(draftStorageKey(WF03.reviewId))).not.toBeNull(),
    );
    await router.navigate(routes.settings());
    await user.click(await screen.findByRole("switch", { name: "Simulated offline" }));
    await waitFor(async () => expect((await services.repo.demo.getFaults()).offline).toBe(true));
    await router.navigate(routes.decision(WF03.reviewId));
    expect(await screen.findByTestId("decision-offline")).toBeTruthy();
    expect(screen.getByTestId("decision-offline").textContent).toContain(
      "Saved as draft on this browser",
    );
    await user.click(await screen.findByRole("button", { name: "Restore draft" }));
    const save = await screen.findByTestId<HTMLButtonElement>("decision-save");
    expect(save.disabled).toBe(true);
    expect((await storedReview(store, WF03.reviewId)).status).toBe("in_review");
  });
});
