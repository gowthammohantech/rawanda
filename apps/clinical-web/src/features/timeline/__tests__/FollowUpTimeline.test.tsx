/**
 * CLN-04 follow-up timeline: events merged newest first; OVERDUE derived only where a `dueAt`
 * exists, is before demo now and the entity is not terminal; `dueAt === now` is not overdue.
 */
import { createSeed, SEED_ANCHORS } from "@laif/mock-data";
import { renderWithProviders } from "@laif/test-utils/web";
import type { FollowUp, Referral, Review } from "@laif/domain";
import { screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { FollowUpTimeline } from "../FollowUpTimeline.tsx";
import { toFollowUpEvents } from "../model.ts";

const NOW = "2026-10-14T06:00:00.000Z";
const seed = createSeed();
const anyReview = seed.reviews.find((r) => r.decision !== null) as Review;
const anyReferral = seed.referrals[0] as Referral;
const anyFollowUp = seed.followUps[0] as FollowUp;

const review = (over: Partial<Review>): Review => ({ ...anyReview, ...over });
const referral = (over: Partial<Referral>): Referral => ({ ...anyReferral, ...over });
const followUp = (over: Partial<FollowUp>): FollowUp => ({ ...anyFollowUp, ...over });

describe("toFollowUpEvents", () => {
  it("merges reviews, referrals and follow-ups newest first", () => {
    const events = toFollowUpEvents(
      {
        reviews: [
          review({
            id: "rev-1" as Review["id"],
            status: "action_recorded",
            decision: {
              kind: "refer",
              note: "",
              decidedBy: "persona-clin-alpha1" as Review["reviewedBy"] & string,
              decidedAt: "2026-10-10T08:00:00.000Z",
            },
          }),
        ],
        referrals: [
          referral({
            id: "ref-1" as Referral["id"],
            reviewId: "rev-1" as Referral["reviewId"],
            status: "created",
            requestedAt: "2026-10-10T08:05:00.000Z",
            dueAt: "2026-10-20T08:00:00.000Z",
            appointmentAt: null,
            completionEvidence: null,
            completedAt: null,
            cancelled: null,
          }),
        ],
        followUps: [
          followUp({
            id: "fu-1" as FollowUp["id"],
            status: "contacted",
            dueAt: "2026-10-12T08:00:00.000Z",
            assignmentHistory: [
              {
                workerId: "persona-chw-alpha1-a" as FollowUp["assignedWorkerId"] & string,
                assignedAt: "2026-10-11T08:00:00.000Z",
                assignedBy: "persona-clin-alpha1" as FollowUp["assignedWorkerId"] & string,
                reason: null,
              },
            ],
            attempts: [
              {
                id: "att-1" as FollowUp["attempts"][number]["id"],
                at: "2026-10-12T09:00:00.000Z",
                method: "phone",
                result: "not_reached",
                note: "",
                durationMinutes: null,
                recordedBy: "persona-chw-alpha1-a" as FollowUp["attempts"][number]["recordedBy"],
              },
            ],
            outcome: null,
          }),
        ],
      },
      NOW,
    );
    expect(events.map((e) => e.kind)).toEqual([
      "followUpAttempt",
      "followUpAssigned",
      "referralCreated",
      "reviewDecided",
    ]);
    // The referral (due 20 Oct) is not overdue; the open follow-up (due 12 Oct) is.
    expect(events.find((e) => e.kind === "referralCreated")?.overdue).toBe(false);
    expect(events.find((e) => e.kind === "followUpAssigned")?.overdue).toBe(true);
    // Events without a dueAt never carry the derived pill.
    expect(events.filter((e) => e.dueAt === null).every((e) => !e.overdue)).toBe(true);
    // The referral's actor is the reviewer who decided the linked review.
    expect(events.find((e) => e.kind === "referralCreated")?.actorId).toBe("persona-clin-alpha1");
  });

  it("terminal entities and dueAt === now are never overdue", () => {
    const events = toFollowUpEvents(
      {
        reviews: [],
        referrals: [
          referral({
            id: "a" as Referral["id"],
            status: "completed",
            dueAt: "2026-10-01T00:00:00.000Z",
          }),
          referral({
            id: "b" as Referral["id"],
            status: "cancelled_with_reason",
            dueAt: "2026-10-01T00:00:00.000Z",
            cancelled: {
              reasonCode: anyReferral.cancelled?.reasonCode ?? "other",
              reason: "Patient moved away",
            },
          }),
          referral({ id: "c" as Referral["id"], status: "scheduled", dueAt: NOW }),
        ],
        followUps: [
          followUp({
            id: "d" as FollowUp["id"],
            status: "completed",
            dueAt: "2026-10-01T00:00:00.000Z",
          }),
        ],
      },
      NOW,
    );
    expect(events.some((e) => e.overdue)).toBe(false);
  });
});

describe("FollowUpTimeline", () => {
  it("OVERDUE_REFERRAL shows the derived pill with its explanation; others do not", () => {
    const patientId = SEED_ANCHORS.OVERDUE_REFERRAL.patientId;
    const sources = {
      reviews: seed.reviews.filter((r) => r.patientId === patientId),
      referrals: seed.referrals.filter((r) => r.patientId === patientId),
      followUps: seed.followUps.filter((f) => f.patientId === patientId),
    };
    const events = toFollowUpEvents(sources, NOW);
    renderWithProviders(<FollowUpTimeline events={events} />);
    const list = screen.getByRole("list", { name: "Referrals, follow-ups and review decisions" });
    const items = within(list).getAllByRole("listitem");
    expect(items.length).toBe(events.length);
    const overdue = screen.getAllByTestId("overdue-pill");
    expect(overdue.length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText("Overdue (derived from due date)")).toHaveLength(overdue.length);
    for (const event of events.filter((e) => e.overdue)) {
      expect(event.dueAt !== null && event.dueAt < NOW).toBe(true);
    }
    expect(screen.getAllByText(/Due \d/).length).toBeGreaterThanOrEqual(1);
  });

  it("renders no overdue pill when nothing is past due", () => {
    const events = toFollowUpEvents(
      {
        reviews: [],
        referrals: [referral({ status: "created", dueAt: "2026-11-01T00:00:00.000Z" })],
        followUps: [],
      },
      NOW,
    );
    renderWithProviders(<FollowUpTimeline events={events} />);
    expect(screen.queryByTestId("overdue-pill")).toBeNull();
    expect(screen.getByText(/Referral created/)).toBeTruthy();
  });
});
