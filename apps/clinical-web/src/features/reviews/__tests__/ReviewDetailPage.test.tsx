/**
 * CLN-06 review detail on the real repository (memory store, StrictMode):
 * - WF01_FLAGGED_REVIEW: ruleset version, every triggering input with value + unit, completeness
 *   meter, disclaimer, how-to-read, prior records, one `review.viewed`;
 * - Start review → `IN REVIEW`, exactly one `review.started` (double click safe) → Record decision;
 * - conflict fault → ConflictPanel, nothing overwritten, `conflict.detected`, reload → retry works;
 * - in review by someone else → "In review by …" + take over with a reason (`review.taken_over`);
 * - MISSING_UNIT_SCREENING → MISSING / NOT EVALUATED pills;
 * - coordinator → evidence, no Start / Record buttons, read-only text;
 * - out-of-scope review → permission denied without data; unknown id → not found.
 */
import type { Patient, Review } from "@laif/domain";
import { createSeed, FACILITY_IDS, PERSONA_IDS, SEED_ANCHORS } from "@laif/mock-data";
import { createMemoryStoreAdapter } from "@laif/repositories";
import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";

import { routes } from "../../../app/routes.ts";
import { auditEvents, renderApp } from "../../../test/render-app.tsx";
import { createTestClinicalRepo } from "../../../test/test-repository.ts";

const CLINICIAN = { personaId: PERSONA_IDS.clinAlpha1, facilityId: FACILITY_IDS.alpha1 };
const COORDINATOR = { personaId: PERSONA_IDS.coordAlpha, facilityId: FACILITY_IDS.alpha1 };
const NURSE = { personaId: PERSONA_IDS.nurseAlpha2, facilityId: FACILITY_IDS.alpha2 };
const WF01 = SEED_ANCHORS.WF01_FLAGGED_REVIEW;
const WF04 = SEED_ANCHORS.WF04_OTHER_FACILITY_PATIENT;
const MISSING = SEED_ANCHORS.MISSING_UNIT_SCREENING;
const seed = createSeed();
const patientOf = (id: string) => seed.patients.find((p) => p.id === id) as Patient;
const VERSION = "demo-ruleset-2026.10-v1";

const forReview = async (store: Parameters<typeof auditEvents>[0], action: string, id: string) =>
  (await auditEvents(store, action)).filter((e) => e.entityId === id);

async function storedReview(store: Parameters<typeof auditEvents>[0], id: string) {
  return (await store.get<Review>("reviews", id)) as Review;
}

const statusPill = () => screen.getByTestId("review-status");

describe("ReviewDetailPage", () => {
  it("WF-01: shows ruleset, triggering inputs with units, completeness, disclaimer; one review.viewed", async () => {
    const { store } = await renderApp({ path: routes.review(WF01.reviewId), signIn: CLINICIAN });
    const detail = await screen.findByTestId("review-detail");
    const patient = patientOf(WF01.patientId);
    expect(screen.getByRole("heading", { level: 1, name: "Review detail" })).toBeTruthy();
    const crumbs = screen.getByRole("navigation", { name: /breadcrumb/i });
    expect(within(crumbs).getByRole("link", { name: "Review queue" })).toBeTruthy();
    expect(crumbs.textContent).toContain(patient.syntheticIdentifier);
    expect(statusPill().getAttribute("data-status")).toBe("pending");

    expect(screen.getByTestId("ruleset-chip").textContent).toContain(VERSION);
    const rows = within(detail).getAllByTestId("evidence-row");
    const triggered = rows.filter((r) => r.getAttribute("data-status") === "TRIGGERED");
    expect(triggered.map((r) => r.getAttribute("data-input"))).toEqual([
      "systolic",
      "diastolic",
      "glucoseValue",
    ]);
    expect(triggered[0]?.textContent).toContain("162 mmHg");
    expect(triggered[1]?.textContent).toContain("98 mmHg");
    expect(triggered[2]?.textContent).toContain("13.4 mmol/L");
    expect(screen.getByTestId("completeness-meter").textContent).toContain(
      "5 of 5 required inputs present",
    );
    expect(screen.getAllByText("DEMO_RULE_NOT_CLINICALLY_VALIDATED").length).toBeGreaterThan(0);
    expect(screen.getByTestId("how-to-read").textContent).toContain("It is not a diagnosis");
    await waitFor(() =>
      expect(
        within(screen.getByTestId("prior-records")).getAllByRole("row").length,
      ).toBeGreaterThan(1),
    );
    expect(screen.getByTestId("responsibility").textContent).toContain("Zorvel Quorandi (you)");
    expect(screen.getByTestId("provenance").textContent).toContain("Screening version");

    // No numeric threshold without the "Demo placeholder value" label.
    for (const threshold of screen.getAllByTestId("evidence-threshold")) {
      expect(threshold.textContent).toContain("Demo placeholder value");
    }
    for (const el of screen.queryAllByText(/demo threshold \d/u)) {
      expect(el.textContent).toContain("demo placeholder value");
    }

    await waitFor(async () =>
      expect(await forReview(store, "review.viewed", WF01.reviewId)).toHaveLength(1),
    );
  });

  it("Start review → IN REVIEW, exactly one review.started even on a double click", async () => {
    const user = userEvent.setup();
    const { store } = await renderApp({ path: routes.review(WF01.reviewId), signIn: CLINICIAN });
    const start = await screen.findByTestId("start-review");
    await user.dblClick(start);
    await waitFor(() => expect(statusPill().getAttribute("data-status")).toBe("in_review"));
    expect(statusPill().textContent).toBe("In review");
    expect(await screen.findByTestId("record-decision")).toBeTruthy();
    expect(screen.queryByTestId("start-review")).toBeNull();
    expect(await screen.findByText("Review started")).toBeTruthy();
    expect(await forReview(store, "review.started", WF01.reviewId)).toHaveLength(1);
    const saved = await storedReview(store, WF01.reviewId);
    expect(saved.status).toBe("in_review");
    expect(saved.startedBy).toBe(PERSONA_IDS.clinAlpha1);
  });

  it("conflict fault → ConflictPanel, nothing overwritten; reload then start succeeds", async () => {
    const user = userEvent.setup();
    const { store, services } = await renderApp({
      path: routes.review(WF01.reviewId),
      signIn: CLINICIAN,
    });
    await services.repo.demo.setFaults({
      conflictOnce: [{ entityType: "review", entityId: WF01.reviewId }],
    });
    await user.click(await screen.findByTestId("start-review"));
    const panel = await screen.findByTestId("conflict-panel");
    expect(panel.textContent).toContain("Another clinician changed this review");
    expect(panel.textContent).toContain("Your version");
    expect(panel.textContent).toContain("Latest version");
    expect(within(panel).getByText("Conflict")).toBeTruthy();
    expect((await storedReview(store, WF01.reviewId)).status).toBe("pending");
    expect(await forReview(store, "review.started", WF01.reviewId)).toHaveLength(0);
    expect(await forReview(store, "conflict.detected", WF01.reviewId)).toHaveLength(1);
    expect(screen.getByTestId<HTMLButtonElement>("start-review").disabled).toBe(true);

    await user.click(within(panel).getByRole("button", { name: "Keep the latest version" }));
    await waitFor(() => expect(screen.queryByTestId("conflict-panel")).toBeNull());
    await user.click(screen.getByTestId("start-review"));
    await waitFor(() => expect(statusPill().getAttribute("data-status")).toBe("in_review"));
    expect(await forReview(store, "review.started", WF01.reviewId)).toHaveLength(1);
  });

  it("Cancel closes the conflict panel without changes", async () => {
    const user = userEvent.setup();
    const { services } = await renderApp({ path: routes.review(WF01.reviewId), signIn: CLINICIAN });
    await services.repo.demo.setFaults({
      conflictOnce: [{ entityType: "review", entityId: WF01.reviewId }],
    });
    await user.click(await screen.findByTestId("start-review"));
    const panel = await screen.findByTestId("conflict-panel");
    await user.click(within(panel).getByRole("button", { name: "Cancel" }));
    expect(screen.queryByTestId("conflict-panel")).toBeNull();
    expect(statusPill().getAttribute("data-status")).toBe("pending");
  });

  it("in review by someone else → 'In review by …' and take over with a reason", async () => {
    const user = userEvent.setup();
    const store = createMemoryStoreAdapter();
    await createTestClinicalRepo(CLINICIAN, store);
    const review = await storedReview(store, WF01.reviewId);
    await store.put("reviews", {
      ...review,
      status: "in_review",
      startedBy: PERSONA_IDS.nurseAlpha2,
      version: review.version + 1,
    });
    const rendered = await renderApp({
      path: routes.review(WF01.reviewId),
      signIn: CLINICIAN,
      store,
    });
    expect((await screen.findByTestId("in-review-by")).textContent).toBe(
      "In review by Quilra Xabezo",
    );
    expect(screen.queryByTestId("record-decision")).toBeNull();
    await user.click(screen.getByTestId("take-over"));
    const dialog = await screen.findByRole("dialog", { name: "Take over this review?" });
    const confirm = within(dialog).getByRole("button", { name: "Take over" });
    expect((confirm as HTMLButtonElement).disabled).toBe(true);
    await user.type(
      within(dialog).getByLabelText(/Reason for taking over/u),
      "Reviewer is off shift today (demo)",
    );
    await user.click(confirm);
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(await screen.findByTestId("record-decision")).toBeTruthy();
    const [event] = await forReview(rendered.store, "review.taken_over", WF01.reviewId);
    expect(event?.justification).toBe("Reviewer is off shift today (demo)");
    expect((await storedReview(store, WF01.reviewId)).startedBy).toBe(PERSONA_IDS.clinAlpha1);
  });

  it("no usable evidence snapshot → cannot-be-reviewed state, DEMO_RULE disclaimer still shown", async () => {
    const store = createMemoryStoreAdapter();
    await createTestClinicalRepo(CLINICIAN, store);
    const review = await storedReview(store, WF01.reviewId);
    await store.put("reviews", { ...review, evidenceSnapshot: null } as unknown as Review);
    await renderApp({ path: routes.review(WF01.reviewId), signIn: CLINICIAN, store });
    expect(await screen.findByTestId("evidence-empty")).toBeTruthy();
    expect(screen.getAllByText("DEMO_RULE_NOT_CLINICALLY_VALIDATED").length).toBeGreaterThan(0);
    expect(screen.queryByTestId("start-review")).toBeNull();
  });

  it("MISSING_UNIT_SCREENING shows MISSING / NOT EVALUATED with icon + text", async () => {
    await renderApp({ path: routes.review(MISSING.reviewId), signIn: NURSE });
    const detail = await screen.findByTestId("review-detail");
    const rows = within(detail).getAllByTestId("evidence-row");
    const unit = rows.find((r) => r.getAttribute("data-input") === "glucoseUnit") as HTMLElement;
    expect(unit.getAttribute("data-status")).toBe("MISSING");
    expect(within(unit).getByText("Missing")).toBeTruthy();
    expect(unit.querySelector("svg")).not.toBeNull();
    const glucose = rows.find(
      (r) => r.getAttribute("data-input") === "glucoseValue",
    ) as HTMLElement;
    expect(glucose.getAttribute("data-status")).toBe("NOT_EVALUATED");
    expect(within(glucose).getByText("Not evaluated")).toBeTruthy();
    expect(screen.getByTestId("completeness-meter").textContent).toContain(
      "4 of 5 required inputs present",
    );
    // Seeded in review by this nurse → Record decision.
    expect(screen.getByTestId("record-decision")).toBeTruthy();
  });

  it("coordinator sees the evidence but no Start / Record buttons", async () => {
    await renderApp({ path: routes.review(WF01.reviewId), signIn: COORDINATOR });
    expect(await screen.findByTestId("evidence-panel")).toBeTruthy();
    expect(screen.getByTestId("read-only-coordinator").textContent).toBe(
      "Decisions require a clinician or authorised reviewer",
    );
    expect(screen.queryByTestId("start-review")).toBeNull();
    expect(screen.queryByTestId("record-decision")).toBeNull();
    expect(screen.queryByTestId("take-over")).toBeNull();
  });

  it("an out-of-scope review is denied with no data and one access.denied", async () => {
    const { store } = await renderApp({ path: routes.review(WF04.reviewId), signIn: CLINICIAN });
    expect(await screen.findByTestId("permission-denied")).toBeTruthy();
    const patient = patientOf(WF04.patientId);
    const text = document.body.textContent ?? "";
    expect(text).not.toContain(patient.displayName);
    expect(text).not.toContain(patient.syntheticIdentifier);
    expect(screen.queryByTestId("review-detail")).toBeNull();
    await waitFor(async () =>
      expect(await forReview(store, "access.denied", WF04.reviewId)).toHaveLength(1),
    );
    expect(await forReview(store, "review.viewed", WF04.reviewId)).toHaveLength(0);
  });

  it("an unknown id shows the not-found state", async () => {
    await renderApp({ path: routes.review("rev-does-not-exist"), signIn: CLINICIAN });
    expect(await screen.findByText("No review with this ID in your facilities")).toBeTruthy();
    expect(screen.getByRole("link", { name: "Back to review queue" })).toBeTruthy();
  });

  it("offline → Start review disabled with the reason (last loaded review stays visible)", async () => {
    const user = userEvent.setup();
    const { router, services } = await renderApp({
      path: routes.review(WF01.reviewId),
      signIn: CLINICIAN,
    });
    await screen.findByTestId("start-review");
    await router.navigate(routes.settings());
    await user.click(await screen.findByRole("switch", { name: "Simulated offline" }));
    await waitFor(async () => expect((await services.repo.demo.getFaults()).offline).toBe(true));
    await router.navigate(routes.review(WF01.reviewId));
    const start = await screen.findByTestId<HTMLButtonElement>("start-review");
    await waitFor(() => expect(start.disabled).toBe(true));
    expect(screen.getByTestId("start-offline").textContent).toBe(
      "Simulated offline — a review cannot be started right now",
    );
  });
});
