import type { AuditEvent, Patient, Referral, Review } from "@laif/domain";
import { FACILITY_IDS, PERSONA_IDS, SEED_ANCHORS } from "@laif/mock-data";
import { describe, expect, it } from "vitest";

import { createHarness, type Harness } from "../testing/harness.ts";

async function decidedReviewWithoutReferral(h: Harness): Promise<Review> {
  const referrals = await h.store.getAll<Referral>("referrals");
  const review = (await h.store.getAll<Review>("reviews")).find(
    (r) =>
      r.status === "action_recorded" &&
      r.facilityId === FACILITY_IDS.alpha1 &&
      !referrals.some((x) => x.reviewId === r.id),
  );
  if (review) return review;
  const decided = await h.repo.decideReview(
    {
      kind: "no_further_action",
      reviewId: SEED_ANCHORS.WF01_FLAGGED_REVIEW.reviewId,
      expectedVersion: 1,
      note: "Assessed in clinic today.",
    },
    h.key(),
  );
  return decided.data;
}

describe("referrals service", () => {
  it("createReferral from a decided review; patient must match; worker must be authorised", async () => {
    const h = await createHarness({ personaId: PERSONA_IDS.clinAlpha1 });
    const review = await decidedReviewWithoutReferral(h);
    const input = {
      reviewId: review.id,
      patientId: review.patientId,
      destinationFacilityId: FACILITY_IDS.alpha2,
      dueAt: "2026-10-25T06:00:00.000Z",
      priority: "routine" as const,
      referralReason: "Needs a medical officer review.",
      assignedWorkerId: PERSONA_IDS.chwAlpha1A,
    };
    await expect(
      h.repo.createReferral({ ...input, patientId: "someone-else" }, h.key()),
    ).rejects.toMatchObject({
      fieldErrors: { patientId: { key: "invalid" } },
    });
    await expect(
      h.repo.createReferral({ ...input, destinationFacilityId: "fac-nowhere" }, h.key()),
    ).rejects.toMatchObject({ fieldErrors: { destinationFacilityId: { key: "invalid" } } });
    await expect(
      h.repo.createReferral({ ...input, assignedWorkerId: PERSONA_IDS.chwAlpha2A }, h.key()),
    ).rejects.toMatchObject({ reason: "WORKER_NOT_AUTHORISED" });
    const created = await h.repo.createReferral(input, h.key());
    expect(created.data).toMatchObject({
      status: "created",
      assignedWorkerId: PERSONA_IDS.chwAlpha1A,
      referralReason: "Needs a medical officer review.",
    });
    expect(created.data.destination).toContain("Demo");
  });

  it("transitions follow the machine; others → INVALID_TRANSITION; cancel needs a reason", async () => {
    const h = await createHarness({ personaId: PERSONA_IDS.clinAlpha1 });
    const ref = (await h.store.get<Referral>(
      "referrals",
      SEED_ANCHORS.OVERDUE_REFERRAL.referralId,
    ))!;
    expect(ref.status).toBe("scheduled");
    await expect(
      h.repo.transitionReferral(
        { referralId: ref.id, expectedVersion: ref.version, to: "accepted" },
        h.key(),
      ),
    ).rejects.toMatchObject({ code: "VALIDATION_ERROR", reason: "INVALID_TRANSITION" });
    await expect(
      h.repo.transitionReferral(
        {
          referralId: ref.id,
          expectedVersion: ref.version,
          to: "cancelled_with_reason",
          cancelReasonCode: "other",
          reason: "short",
        },
        h.key(),
      ),
    ).rejects.toMatchObject({ fieldErrors: { reason: { key: "reasonTooShort" } } });
    const cancelled = await h.repo.transitionReferral(
      {
        referralId: ref.id,
        expectedVersion: ref.version,
        to: "cancelled_with_reason",
        cancelReasonCode: "patient_declined",
        reason: "Patient prefers to attend another clinic.",
      },
      h.key(),
    );
    expect(cancelled.data).toMatchObject({
      status: "cancelled_with_reason",
      cancelled: { reasonCode: "patient_declined" },
    });
    await expect(
      h.repo.transitionReferral(
        {
          referralId: ref.id,
          expectedVersion: cancelled.entityVersion,
          to: "completed",
          completedAt: "2026-10-14T05:00:00.000Z",
          outcome: "attended_seen",
          evidenceType: "clinician_confirmation",
          evidenceReference: "REF-1",
        },
        h.key(),
      ),
    ).rejects.toMatchObject({ reason: "INVALID_TRANSITION" });
    // CHW cannot complete referrals.
    h.as(PERSONA_IDS.chwAlpha1A);
    await expect(
      h.repo.transitionReferral(
        { referralId: ref.id, expectedVersion: cancelled.entityVersion, to: "accepted" },
        h.key(),
      ),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("list / count with derived overdue", async () => {
    const h = await createHarness({ personaId: PERSONA_IDS.clinAlpha1 });
    const counts = await h.repo.countReferrals({});
    const list = await h.repo.listReferrals({ pageSize: 200 });
    expect(counts["all"]).toBe(list.total);
    expect(counts["overdue"]).toBeGreaterThan(0);
    const overdue = await h.repo.listReferrals({ overdueOnly: true, pageSize: 200 });
    expect(overdue.total).toBe(counts["overdue"]);
    expect(overdue.items.map((r) => r.id)).toContain(SEED_ANCHORS.OVERDUE_REFERRAL.referralId);
    const scheduled = await h.repo.listReferrals({ statuses: ["scheduled"] });
    expect(scheduled.total).toBe(counts["scheduled"]);
    const dues = list.items.map((r) => r.dueAt);
    expect([...dues].sort()).toEqual(dues);
    const filtered = await h.repo.listReferrals({
      priorities: ["routine"],
      patientId: SEED_ANCHORS.OVERDUE_REFERRAL.patientId,
      facilityIds: [FACILITY_IDS.alpha1],
      destinationFacilityIds: [FACILITY_IDS.alpha2, FACILITY_IDS.alpha1, FACILITY_IDS.beta1],
    });
    expect(filtered.total).toBeGreaterThan(0);
    h.as(PERSONA_IDS.chwAlpha1A);
    const mine = await h.repo.listReferrals({ assignedWorkerId: PERSONA_IDS.chwAlpha1A });
    expect(mine.items.every((r) => r.assignedWorkerId === PERSONA_IDS.chwAlpha1A)).toBe(true);
  });

  it("CLN-08 q search matches patient name / destination; counts follow the same filter", async () => {
    const h = await createHarness({ personaId: PERSONA_IDS.clinAlpha1 });
    const anchor = SEED_ANCHORS.OVERDUE_REFERRAL;
    const patient = (await h.store.get<Patient>("patients", anchor.patientId))!;
    const q = patient.displayName.slice(0, 5);
    const list = await h.repo.listReferrals({ q, pageSize: 200 });
    expect(list.items.map((r) => r.id)).toContain(anchor.referralId);
    const counts = await h.repo.countReferrals({ q });
    expect(counts["all"]).toBe(list.total);
    expect((await h.repo.listReferrals({ q: "zz-no-such-name" })).total).toBe(0);
  });

  it("CLN-08 getReferral: in scope → row; out of scope → FORBIDDEN + access.denied; unknown → null", async () => {
    const h = await createHarness({ personaId: PERSONA_IDS.clinAlpha1 });
    const own = await h.repo.getReferral(SEED_ANCHORS.OVERDUE_REFERRAL.referralId);
    expect(own?.id).toBe(SEED_ANCHORS.OVERDUE_REFERRAL.referralId);
    expect(await h.repo.getReferral("ref-nope")).toBeNull();
    const other = SEED_ANCHORS.COMPLETED_REFERRAL_WITH_EVIDENCE.referralId;
    await expect(h.repo.getReferral(other)).rejects.toMatchObject({ code: "FORBIDDEN" });
    const denied = (await h.store.getAll<AuditEvent>("auditEvents")).filter(
      (e) => e.action === "access.denied" && e.entityId === other,
    );
    expect(denied.length).toBeGreaterThan(0);
  });

  it("CLN-08 editReferral: reason required, previous values audited, stale → CONFLICT, terminal refused", async () => {
    const h = await createHarness({ personaId: PERSONA_IDS.clinAlpha1 });
    const ref = (await h.store.get<Referral>(
      "referrals",
      SEED_ANCHORS.OVERDUE_REFERRAL.referralId,
    ))!;
    const base = { referralId: ref.id, expectedVersion: ref.version };
    await expect(
      h.repo.editReferral(
        { ...base, dueAt: "2026-10-30T06:00:00.000Z", changeReason: "x" },
        h.key(),
      ),
    ).rejects.toMatchObject({ fieldErrors: { changeReason: { key: "reasonTooShort" } } });
    await expect(
      h.repo.editReferral({ ...base, changeReason: "Nothing actually changes here." }, h.key()),
    ).rejects.toMatchObject({ code: "VALIDATION_ERROR" });
    await expect(
      h.repo.editReferral(
        { ...base, dueAt: "2026-10-01T06:00:00.000Z", changeReason: "Clinic moved the slot." },
        h.key(),
      ),
    ).rejects.toMatchObject({ fieldErrors: { dueAt: { key: "dateMustBeFuture" } } });
    const edited = await h.repo.editReferral(
      {
        ...base,
        dueAt: "2026-10-30T06:00:00.000Z",
        destinationFacilityId: FACILITY_IDS.alpha2,
        changeReason: "Destination clinic has an earlier slot.",
      },
      h.key(),
    );
    expect(edited.data).toMatchObject({
      dueAt: "2026-10-30T06:00:00.000Z",
      destinationFacilityId: FACILITY_IDS.alpha2,
      status: ref.status,
    });
    const event = (await h.store.getAll<AuditEvent>("auditEvents")).find(
      (e) => e.id === edited.auditEventId,
    )!;
    expect(event.action).toBe("clinical.referral.updated");
    expect(event.justification).toBe("Destination clinic has an earlier slot.");
    expect(event.changeSummary).toMatchObject({ dueAt: { from: ref.dueAt } });
    await expect(
      h.repo.editReferral(
        { ...base, dueAt: "2026-11-02T06:00:00.000Z", changeReason: "Second edit, stale copy." },
        h.key(),
      ),
    ).rejects.toMatchObject({ code: "CONFLICT", conflict: { latest: { id: ref.id } } });
    const done = await h.repo.transitionReferral(
      {
        referralId: ref.id,
        expectedVersion: edited.entityVersion,
        to: "completed",
        completedAt: "2026-10-14T05:00:00.000Z",
        outcome: "attended_seen",
        evidenceType: "facility_attendance_record",
        evidenceReference: "REG-2026-001",
      },
      h.key(),
    );
    const completedEvent = (await h.store.getAll<AuditEvent>("auditEvents")).find(
      (e) => e.id === done.auditEventId,
    )!;
    expect(completedEvent.changeSummary).toMatchObject({
      from: "scheduled",
      to: "completed",
      evidenceType: "facility_attendance_record",
      evidenceReference: "REG-2026-001",
    });
    await expect(
      h.repo.editReferral(
        {
          referralId: ref.id,
          expectedVersion: done.entityVersion,
          dueAt: "2026-11-02T06:00:00.000Z",
          changeReason: "Too late, it is completed.",
        },
        h.key(),
      ),
    ).rejects.toMatchObject({ reason: "INVALID_TRANSITION" });
  });
});
