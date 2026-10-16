import { describe, expect, it } from "vitest";

import type { CareInstruction } from "../../entities/care-instruction.ts";
import type { Review } from "../../entities/review.ts";
import { asId } from "../../ids.ts";
import { makeFollowUp, makeReferral, makeScreening, T0 } from "../../testing/fixtures.ts";
import {
  deriveCitizenReviewState,
  selectApprovedInstructions,
  selectReleasedObservations,
  toCitizenResultLabel,
  type CitizenObservationItem,
} from "../visibility.ts";

const base = { version: 1, createdAt: T0, updatedAt: T0, synthetic: true as const };

function makeReview(overrides: Partial<Review> = {}): Review {
  return {
    ...base,
    id: asId<never>("rev-1"),
    screeningId: asId<never>("scr-1"),
    patientId: asId<never>("pat-1"),
    facilityId: asId<never>("fac-1"),
    assignedClinicianId: null,
    status: "pending",
    flagReasons: ["DEMO_SYSTOLIC_AT_OR_ABOVE_THRESHOLD"] as unknown as Review["flagReasons"],
    evidenceSnapshot: {} as Review["evidenceSnapshot"],
    decision: null,
    decisionReason: null,
    reviewedAt: null,
    startedBy: null,
    reviewedBy: null,
    priority: "routine",
    reviewDueAt: null,
    origin: "rule_flag",
    ...overrides,
  };
}

function makeInstruction(overrides: Partial<CareInstruction> = {}): CareInstruction {
  return {
    ...base,
    id: asId<never>("ci-1"),
    patientId: asId<never>("pat-1"),
    kind: "appointment",
    sourceType: "referral",
    sourceId: "ref-1",
    messageKey: "citizen:nextStep.appointment.message",
    params: {},
    appointmentAt: "2026-10-19T08:30:00.000Z",
    facilityId: asId<never>("fac-1"),
    releasedBy: asId<never>("persona-clin-1"),
    releasedAt: "2026-10-02T08:00:00.000Z",
    status: "released",
    ...overrides,
  };
}

const decided = (kind: "refer" | "no_further_action" | "plan_follow_up") =>
  makeReview({
    status: "action_recorded",
    decision: {
      kind,
      note: "demo",
      decidedBy: asId<never>("persona-clin-1"),
      decidedAt: "2026-10-12T08:00:00.000Z",
    },
    reviewedBy: asId<never>("persona-clin-1"),
    reviewedAt: "2026-10-12T08:00:00.000Z",
  });

const NOW = new Date(T0);

describe("deriveCitizenReviewState", () => {
  it("maps review states to wallet states", () => {
    const flagged = { status: "review_required" as const };
    expect(deriveCitizenReviewState(flagged, makeReview())).toBe("awaiting_review");
    expect(deriveCitizenReviewState(flagged, makeReview({ status: "in_review" }))).toBe(
      "awaiting_review",
    );
    expect(deriveCitizenReviewState(flagged, null)).toBe("awaiting_review");
    expect(deriveCitizenReviewState(flagged, decided("refer"))).toBe("released_follow_up");
    expect(deriveCitizenReviewState(flagged, decided("plan_follow_up"))).toBe("released_follow_up");
    expect(deriveCitizenReviewState(flagged, decided("no_further_action"))).toBe(
      "released_no_action",
    );
    expect(deriveCitizenReviewState(flagged, makeReview({ status: "dismissed_with_reason" }))).toBe(
      "dismissed_with_reason",
    );
    expect(deriveCitizenReviewState({ status: "no_review_required" }, null)).toBe(
      "released_no_action",
    );
    expect(deriveCitizenReviewState({ status: "draft" }, null)).toBeNull();
  });
});

describe("toCitizenResultLabel", () => {
  it("never maps flag reasons — only the three plain-language labels", () => {
    expect(toCitizenResultLabel("released_follow_up")).toBe("followUpAgreed");
    expect(toCitizenResultLabel("released_no_action")).toBe("noActionNeeded");
    expect(toCitizenResultLabel("dismissed_with_reason")).toBe("reviewedNoActionNeeded");
  });
});

describe("selectReleasedObservations", () => {
  const dismissedScreening = makeScreening({
    id: asId<never>("scr-dismissed"),
    status: "review_required",
    measuredAt: "2026-09-03T08:00:00.000Z",
    systolic: 154,
  });
  const awaitingScreening = makeScreening({
    id: asId<never>("scr-awaiting"),
    status: "review_required",
    measuredAt: "2026-10-12T08:00:00.000Z",
    systolic: 171,
    diastolic: 104,
  });
  const draft = makeScreening({ id: asId<never>("scr-draft"), status: "draft" });
  const otherPatient = makeScreening({
    id: asId<never>("scr-other"),
    patientId: asId<never>("pat-2"),
  });
  const dismissedReview = makeReview({
    id: asId<never>("rev-dismissed"),
    screeningId: asId<never>("scr-dismissed"),
    status: "dismissed_with_reason",
    decision: {
      kind: "dismiss",
      note: "Cuff size was wrong for the first reading.",
      reasonCode: "measurement_error_suspected",
      decidedBy: asId<never>("persona-nurse-1"),
      decidedAt: "2026-09-04T08:00:00.000Z",
    },
    decisionReason: "Cuff size was wrong for the first reading.",
  });
  const pendingReview = makeReview({
    id: asId<never>("rev-awaiting"),
    screeningId: asId<never>("scr-awaiting"),
  });

  const items = selectReleasedObservations({
    patientId: "pat-1",
    screenings: [dismissedScreening, awaitingScreening, draft, otherPatient],
    reviews: [dismissedReview, pendingReview],
  });

  it("returns the dismissed screening as reviewed/no action and the awaiting one value-less", () => {
    expect(items.map((i) => [i.kind, i.id])).toEqual([
      ["pending_review", "scr-awaiting"],
      ["released", "scr-dismissed"],
    ]);
    const released = items[1] as Extract<CitizenObservationItem, { kind: "released" }>;
    expect(released.label).toBe("reviewedNoActionNeeded");
    expect(released.reviewState).toBe("dismissed_with_reason");
    expect(released.reviewedBy).toBe("persona-nurse-1");
    expect(released.readings.bloodPressureUnit).toBe("mmHg");
  });

  it("never leaks values, flag reasons or dismiss reasons", () => {
    const json = JSON.stringify(items);
    expect(json).not.toContain("171");
    expect(json).not.toContain("104");
    expect(json).not.toContain("measurement_error_suspected");
    expect(json).not.toContain("Cuff size");
    expect(json).not.toContain("DEMO_SYSTOLIC");
    expect(Object.keys(items[0]!).sort()).toEqual(["id", "kind", "measuredAt", "patientId"]);
  });

  it("drops drafts and other patients' screenings", () => {
    expect(items.some((i) => i.id === "scr-draft" || i.id === "scr-other")).toBe(false);
  });

  it("applies amendments and keeps the original values", () => {
    const amended = makeScreening({
      id: asId<never>("scr-amended"),
      status: "no_review_required",
      glucoseContext: "not_recorded",
      amendments: [
        {
          id: asId<never>("amd-1"),
          field: "glucoseContext",
          before: "not_recorded",
          after: "fasting",
          reason: "glucose_context_corrected",
          amendedBy: asId<never>("persona-clin-1"),
          amendedAt: "2026-10-01T08:00:00.000Z",
        },
      ],
    });
    const [item] = selectReleasedObservations({
      patientId: "pat-1",
      screenings: [amended],
      reviews: [],
    });
    expect(item?.kind).toBe("released");
    if (item?.kind !== "released") return;
    expect(item.readings.glucoseContext).toBe("fasting");
    expect(item.originalReadings?.glucoseContext).toBe("not_recorded");
    expect(item.amendments[0]?.reasonKey).toBe("glucose_context_corrected");
    expect(item.label).toBe("noActionNeeded");
  });

  it("free-text amendment reasons never leave the projection", () => {
    const amended = makeScreening({
      status: "no_review_required",
      amendments: [
        {
          id: asId<never>("amd-2"),
          field: "systolic",
          before: 130,
          after: 128,
          reason: "Transcription error on the paper form.",
          amendedBy: asId<never>("persona-clin-1"),
          amendedAt: "2026-10-01T08:00:00.000Z",
        },
      ],
    });
    const [item] = selectReleasedObservations({
      patientId: "pat-1",
      screenings: [amended],
      reviews: [],
    });
    expect(JSON.stringify(item)).not.toContain("Transcription");
  });

  it("a single free-text word is not treated as a reason key", () => {
    const amended = makeScreening({
      status: "no_review_required",
      amendments: [
        {
          id: asId<never>("amd-3"),
          field: "systolic",
          before: 130,
          after: 128,
          reason: "misreading",
          amendedBy: asId<never>("persona-clin-1"),
          amendedAt: "2026-10-01T08:00:00.000Z",
        },
      ],
    });
    const [item] = selectReleasedObservations({
      patientId: "pat-1",
      screenings: [amended],
      reviews: [],
    });
    expect(item?.kind === "released" ? item.amendments[0]?.reasonKey : undefined).toBeNull();
  });
});

describe("selectApprovedInstructions", () => {
  const scheduled = makeReferral({
    id: asId<never>("ref-1"),
    status: "scheduled",
    reviewId: asId<never>("rev-1"),
  });
  const completedFu = makeFollowUp({
    id: asId<never>("fu-1"),
    status: "completed",
    referralId: null,
    reviewId: asId<never>("rev-2"),
    outcome: {
      kind: "attended",
      occurredAt: "2026-09-10T08:00:00.000Z",
      evidenceType: "facility_visit_confirmed",
      reasonCode: null,
      note: "",
      recordedBy: asId<never>("persona-chw-1"),
    } as never,
  });
  const appointment = makeInstruction();
  const followUp = makeInstruction({
    id: asId<never>("ci-2"),
    kind: "follow_up",
    sourceType: "follow_up",
    sourceId: "fu-1",
    appointmentAt: null,
    releasedAt: "2026-09-01T08:00:00.000Z",
  });
  const withdrawn = makeInstruction({ id: asId<never>("ci-3"), status: "withdrawn" });
  const otherPatient = makeInstruction({
    id: asId<never>("ci-4"),
    patientId: asId<never>("pat-2"),
  });

  it("returns only approved (released) instructions of the patient with derived progress", () => {
    const items = selectApprovedInstructions({
      patientId: "pat-1",
      instructions: [appointment, followUp, withdrawn, otherPatient],
      referrals: [scheduled],
      followUps: [completedFu],
      acks: [{ id: "ack-1", instructionId: "ci-2", acknowledgedAt: "2026-09-02T08:00:00.000Z" }],
      now: NOW,
    });
    expect(items.map((i) => i.id)).toEqual(["ci-1", "ci-2"]);
    expect(items.every((i) => i.approvalState === "approved")).toBe(true);
    expect(items[0]).toMatchObject({ progress: "planned", datePassed: false, reviewId: "rev-1" });
    expect(items[1]).toMatchObject({
      progress: "completed",
      reviewId: "rev-2",
      acknowledgement: { id: "ack-1" },
    });
  });

  it("flags a passed appointment as datePassed (never 'overdue')", () => {
    const [item] = selectApprovedInstructions({
      patientId: "pat-1",
      instructions: [appointment],
      referrals: [scheduled],
      followUps: [],
      now: new Date("2026-10-20T08:00:00.000Z"),
    });
    expect(item?.datePassed).toBe(true);
    expect(JSON.stringify(item)).not.toMatch(/overdue/iu);
  });
});
