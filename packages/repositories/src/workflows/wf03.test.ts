/** WF-03: dismissal needs a reason, records attribution, and creates nothing else. */
import type { AuditEvent, FollowUp, Referral, Review } from "@laif/domain";
import { PERSONA_IDS, SEED_ANCHORS } from "@laif/mock-data";
import { describe, expect, it } from "vitest";

import { createHarness } from "../testing/harness.ts";

const REVIEW = SEED_ANCHORS.WF03_DISMISSABLE_FLAG.reviewId;

describe("WF-03 dismissal", () => {
  it("without a reason → VALIDATION_ERROR (translatable field error)", async () => {
    const h = await createHarness({ personaId: PERSONA_IDS.clinAlpha1 });
    const review = (await h.store.get<Review>("reviews", REVIEW))!;
    await expect(
      h.repo.decideReview(
        {
          kind: "dismiss",
          reviewId: REVIEW,
          expectedVersion: review.version,
          dismissReasonCode: "repeat_reading_acceptable",
          reason: "too short",
        },
        h.key(),
      ),
    ).rejects.toMatchObject({
      code: "VALIDATION_ERROR",
      status: 422,
      fieldErrors: { reason: { key: "reasonTooShort", params: { min: 10 } } },
    });
    await expect(
      h.repo.decideReview(
        {
          kind: "dismiss",
          reviewId: REVIEW,
          expectedVersion: review.version,
          dismissReasonCode: "other",
        } as never,
        h.key(),
      ),
    ).rejects.toMatchObject({ fieldErrors: { reason: { key: "required" } } });
    expect(await h.store.get<Review>("reviews", REVIEW)).toEqual(review);
  });

  it("with a reason → dismissed_with_reason, no referral / follow-up, audit has actor + justification", async () => {
    const h = await createHarness({ personaId: PERSONA_IDS.clinAlpha1 });
    const review = (await h.store.get<Review>("reviews", REVIEW))!;
    const referrals = (await h.store.getAll<Referral>("referrals")).length;
    const followUps = (await h.store.getAll<FollowUp>("followUps")).length;
    const reason = "Repeat reading after five minutes rest was within range.";
    const result = await h.repo.decideReview(
      {
        kind: "dismiss",
        reviewId: REVIEW,
        expectedVersion: review.version,
        dismissReasonCode: "repeat_reading_acceptable",
        reason,
      },
      h.key(),
    );
    expect(result.data).toMatchObject({
      status: "dismissed_with_reason",
      decisionReason: reason,
      reviewedBy: PERSONA_IDS.clinAlpha1,
      decision: {
        kind: "dismiss",
        reasonCode: "repeat_reading_acceptable",
        decidedBy: PERSONA_IDS.clinAlpha1,
        decidedAt: "2026-10-14T06:00:00.000Z",
      },
    });
    expect(await h.store.getAll("referrals")).toHaveLength(referrals);
    expect(await h.store.getAll("followUps")).toHaveLength(followUps);
    const event = (await h.store.getAll<AuditEvent>("auditEvents")).find(
      (e) => e.id === result.auditEventId,
    );
    expect(event).toMatchObject({
      action: "review.dismissed",
      actorId: PERSONA_IDS.clinAlpha1,
      actorRole: "clinician",
      justification: reason,
      changeSummary: { kind: "dismiss", reasonCode: "repeat_reading_acceptable" },
    });
    // A dismissed review cannot get a referral afterwards.
    await expect(
      h.repo.createReferral(
        {
          reviewId: REVIEW,
          patientId: review.patientId,
          destinationFacilityId: "fac-alpha-2",
          dueAt: "2026-10-20T06:00:00.000Z",
          priority: "routine",
          referralReason: "Trying to refer a dismissed flag.",
        },
        h.key(),
      ),
    ).rejects.toMatchObject({ code: "VALIDATION_ERROR", reason: "INVALID_TRANSITION" });
  });
});
