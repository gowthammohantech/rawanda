/**
 * WF-01 end to end on one store: CHW screening → flag (stored ruleset) → review → referral →
 * attendance follow-up → worker outcome → clinician confirmation. Reminders never move status.
 */
import type { AuditEvent, FollowUp, Referral, Reminder, Review } from "@laif/domain";
import { PERSONA_IDS } from "@laif/mock-data";
import { describe, expect, it } from "vitest";

import { createHarness } from "../testing/harness.ts";

describe("WF-01 screening → review → referral → follow-up", () => {
  it("runs the full pathway with attribution, evidence and confirmation", async () => {
    const h = await createHarness({ personaId: PERSONA_IDS.chwAlpha1A });
    const patient = h.seed.patients.find((p) => p.facilityId === "fac-alpha-1")!;

    // 1–4: capture and evaluate (illustrative demo rule).
    const screening = await h.repo.createScreening(
      {
        patientId: patient.id,
        measuredAt: "2026-10-14T05:45:00.000Z",
        systolic: 150,
        diastolic: 92,
        glucoseValue: 6.1,
        glucoseUnit: "mmol/L",
        glucoseContext: "fasting",
      },
      h.key(),
    );
    expect(screening.data).toMatchObject({
      status: "review_required",
      rulesetVersion: "demo-ruleset-2026.10-v1",
      flag: {
        requiresReview: true,
        reasonCodes: ["DEMO_BP_SYSTOLIC_AT_OR_ABOVE_THRESHOLD"],
        displayDisclaimer: "DEMO_RULE_NOT_CLINICALLY_VALIDATED",
      },
    });
    const review = (await h.store.getAll<Review>("reviews")).find(
      (r) => r.screeningId === screening.data.id,
    )!;
    expect(review).toMatchObject({ status: "pending", origin: "rule_flag", priority: "routine" });

    // 5–6: clinician reviews and refers.
    h.as(PERSONA_IDS.clinAlpha1);
    const started = await h.repo.startReview({ reviewId: review.id, expectedVersion: 1 }, h.key());
    expect(started.data).toMatchObject({ status: "in_review", startedBy: PERSONA_IDS.clinAlpha1 });
    const detail = await h.repo.getReview(review.id);
    expect(detail?.screening?.id).toBe(screening.data.id);
    expect(detail?.patient?.id).toBe(patient.id);
    const decided = await h.repo.decideReview(
      {
        kind: "refer",
        reviewId: review.id,
        expectedVersion: started.entityVersion,
        destinationFacilityId: "fac-alpha-2",
        referralReason: "Systolic reading above the demo threshold.",
        dueAt: "2026-10-21T06:00:00.000Z",
        priority: "routine",
      },
      h.key(),
    );
    expect(decided.data).toMatchObject({
      status: "action_recorded",
      reviewedBy: PERSONA_IDS.clinAlpha1,
      decision: { kind: "refer", decidedBy: PERSONA_IDS.clinAlpha1 },
    });
    const referral = (await h.store.getAll<Referral>("referrals")).find(
      (r) => r.reviewId === review.id,
    )!;
    expect(referral).toMatchObject({ status: "created", destinationFacilityId: "fac-alpha-2" });

    // Referral lifecycle; completed requires evidence.
    let ref = await h.repo.transitionReferral(
      { referralId: referral.id, expectedVersion: 1, to: "accepted" },
      h.key(),
    );
    ref = await h.repo.transitionReferral(
      {
        referralId: referral.id,
        expectedVersion: ref.entityVersion,
        to: "scheduled",
        appointmentAt: "2026-10-16T07:00:00.000Z",
      },
      h.key(),
    );
    await expect(
      h.repo.transitionReferral(
        {
          referralId: referral.id,
          expectedVersion: ref.entityVersion,
          to: "completed",
          completedAt: "2026-10-14T05:00:00.000Z",
          outcome: "attended_seen",
        } as never,
        h.key(),
      ),
    ).rejects.toMatchObject({
      code: "VALIDATION_ERROR",
      fieldErrors: { evidenceType: { key: "evidenceRequired" } },
    });

    // 7: attendance follow-up by the CHW, confirmed by the clinician.
    const fu = await h.repo.createFollowUp(
      {
        patientId: patient.id,
        purpose: "referral_attendance",
        dueAt: "2026-10-18T06:00:00.000Z",
        assignedWorkerId: PERSONA_IDS.chwAlpha1A,
        referralId: referral.id,
        note: "Support attendance at Alpha-2.",
      },
      h.key(),
    );
    h.as(PERSONA_IDS.chwAlpha1A);
    const contacted = await h.repo.updateFollowUp(
      {
        followUpId: fu.data.id,
        expectedVersion: 1,
        action: "record_attempt",
        at: "2026-10-14T05:50:00.000Z",
        method: "home_visit",
        result: "reached",
        durationMinutes: 15,
      },
      h.key(),
    );
    expect(contacted.data.status).toBe("contacted");
    const completed = await h.repo.updateFollowUp(
      {
        followUpId: fu.data.id,
        expectedVersion: contacted.entityVersion,
        action: "record_outcome",
        outcome: "attended",
        occurredAt: "2026-10-14T05:55:00.000Z",
        evidenceType: "appointment_card_seen",
      },
      h.key(),
    );
    expect(completed.data).toMatchObject({
      status: "completed",
      clinicianConfirmation: { status: "pending" },
      outcome: { kind: "attended", recordedBy: PERSONA_IDS.chwAlpha1A },
    });

    // A reminder never transitions the follow-up or referral.
    h.as(PERSONA_IDS.citizen1);
    const citizenPatient = h.persona(PERSONA_IDS.citizen1).linkedPatientIds[0]!;
    const before = await h.store.getAll<FollowUp>("followUps");
    await h.repo.setReminderPreference(
      { patientId: citizenPatient, optedIn: false, timing: "day_before" },
      h.key(),
    );
    expect(await h.store.getAll<FollowUp>("followUps")).toEqual(before);

    h.as(PERSONA_IDS.clinAlpha1);
    const confirmed = await h.repo.updateFollowUp(
      {
        followUpId: fu.data.id,
        expectedVersion: completed.entityVersion,
        action: "confirm_completion",
      },
      h.key(),
    );
    expect(confirmed.data.clinicianConfirmation).toMatchObject({
      status: "confirmed",
      by: PERSONA_IDS.clinAlpha1,
    });
    const done = await h.repo.transitionReferral(
      {
        referralId: referral.id,
        expectedVersion: ref.entityVersion,
        to: "completed",
        completedAt: "2026-10-14T05:58:00.000Z",
        outcome: "attended_seen",
        evidenceType: "facility_attendance_record",
        evidenceReference: "REG-2026-0042",
      },
      h.key(),
    );
    expect(done.data).toMatchObject({
      status: "completed",
      completionEvidence: {
        type: "facility_attendance_record",
        recordedBy: PERSONA_IDS.clinAlpha1,
      },
    });

    const trail = (await h.store.getAll<AuditEvent>("auditEvents")).filter(
      (e) =>
        e.patientId === patient.id && e.category === "change" && e.occurredAt === h.clock.nowIso(),
    );
    expect(trail.map((e) => e.action)).toEqual(
      expect.arrayContaining([
        "screening.submitted",
        "review.created",
        "review.started",
        "review.decided",
        "referral.created",
        "referral.transitioned",
        "followup.created",
        "followup.attempt_recorded",
        "followup.outcome_recorded",
        "followup.completion_confirmed",
      ]),
    );
    const reminders = await h.store.getAll<Reminder>("reminders");
    expect(reminders.every((r) => r.status !== "scheduled" || r.patientId !== citizenPatient)).toBe(
      true,
    );
  });

  it("clinician can return a worker completion; re-confirming is refused", async () => {
    const h = await createHarness({ personaId: PERSONA_IDS.clinAlpha1 });
    const { SEED_ANCHORS } = await import("@laif/mock-data");
    const fu = (await h.store.get<FollowUp>(
      "followUps",
      SEED_ANCHORS.WF01_WORKER_COMPLETED_FU.followUpId,
    ))!;
    expect(fu.clinicianConfirmation.status).toBe("pending");
    const returned = await h.repo.updateFollowUp(
      {
        followUpId: fu.id,
        expectedVersion: fu.version,
        action: "return_to_worker",
        reason: "Evidence reference is missing, please re-check.",
      },
      h.key(),
    );
    expect(returned.data).toMatchObject({
      status: "contacted",
      completedAt: null,
      clinicianConfirmation: {
        status: "returned",
        reason: "Evidence reference is missing, please re-check.",
      },
    });
    await expect(
      h.repo.updateFollowUp(
        {
          followUpId: fu.id,
          expectedVersion: returned.entityVersion,
          action: "confirm_completion",
        },
        h.key(),
      ),
    ).rejects.toMatchObject({ code: "VALIDATION_ERROR", reason: "INVALID_TRANSITION" });
    await expect(
      h.repo.updateFollowUp(
        {
          followUpId: fu.id,
          expectedVersion: returned.entityVersion,
          action: "return_to_worker",
          reason: "Trying to return it a second time.",
        },
        h.key(),
      ),
    ).rejects.toMatchObject({ code: "VALIDATION_ERROR" });
  });
});
