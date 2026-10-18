import type { AuditEvent, FollowUp } from "@laif/domain";
import { FACILITY_IDS, PERSONA_IDS, SEED_ANCHORS } from "@laif/mock-data";
import { describe, expect, it } from "vitest";

import { createHarness, type Harness } from "../testing/harness.ts";

const FU = SEED_ANCHORS.WF02_FOLLOWUP_CONFLICT.followUpId;
const load = async (h: Harness, id: string = FU) => (await h.store.get<FollowUp>("followUps", id))!;

describe("follow-ups service", () => {
  it("care-team actions: assign, reassign (from unable_to_reach → reassigned), set due date, note", async () => {
    const h = await createHarness({ personaId: PERSONA_IDS.clinAlpha1 });
    let fu = await load(h);
    const assigned = await h.repo.updateFollowUp(
      {
        followUpId: FU,
        expectedVersion: fu.version,
        action: "assign",
        assignedWorkerId: PERSONA_IDS.chwAlpha1B,
        dueAt: "2026-10-19T06:00:00.000Z",
      },
      h.key(),
    );
    expect(assigned.data).toMatchObject({
      assignedWorkerId: PERSONA_IDS.chwAlpha1B,
      dueAt: "2026-10-19T06:00:00.000Z",
    });
    expect(assigned.data.assignmentHistory.at(-1)).toMatchObject({
      workerId: PERSONA_IDS.chwAlpha1B,
      reason: null,
    });
    const due = await h.repo.updateFollowUp(
      {
        followUpId: FU,
        expectedVersion: assigned.entityVersion,
        action: "set_due_date",
        dueAt: "2026-10-20T06:00:00.000Z",
        reason: "Patient travelling until Monday.",
      },
      h.key(),
    );
    expect(due.data.dueAt).toBe("2026-10-20T06:00:00.000Z");
    const noted = await h.repo.updateFollowUp(
      {
        followUpId: FU,
        expectedVersion: due.entityVersion,
        action: "add_note",
        note: "Phoned the family.",
      },
      h.key(),
    );
    expect(noted.data.notes.at(-1)).toMatchObject({
      text: "Phoned the family.",
      by: PERSONA_IDS.clinAlpha1,
    });

    // unable_to_reach → reassigned.
    const utr = SEED_ANCHORS.UNABLE_TO_REACH_FOLLOWUP.followUpId;
    h.as(PERSONA_IDS.nurseAlpha2);
    fu = await load(h, utr);
    expect(fu.status).toBe("unable_to_reach");
    const reassigned = await h.repo.updateFollowUp(
      {
        followUpId: utr,
        expectedVersion: fu.version,
        action: "reassign",
        assignedWorkerId: PERSONA_IDS.chwAlpha2A,
        reason: "Second worker knows the family.",
      },
      h.key(),
    );
    expect(reassigned.data.status).toBe("reassigned");
    const event = (await h.store.getAll<AuditEvent>("auditEvents")).find(
      (e) => e.id === reassigned.auditEventId,
    );
    expect(event).toMatchObject({
      action: "followup.reassigned",
      justification: "Second worker knows the family.",
    });
  });

  it("worker outcomes: unable_to_reach needs a reason code, referred onward stays open, declined completes", async () => {
    const h = await createHarness({ appId: "worker", personaId: PERSONA_IDS.chwAlpha1A });
    let fu = await load(h);
    await expect(
      h.repo.updateFollowUp(
        {
          followUpId: FU,
          expectedVersion: fu.version,
          action: "record_outcome",
          outcome: "unable_to_reach",
          occurredAt: "2026-10-14T05:00:00.000Z",
        },
        h.key(),
      ),
    ).rejects.toMatchObject({ fieldErrors: { reasonCode: { key: "required" } } });
    await expect(
      h.repo.updateFollowUp(
        {
          followUpId: FU,
          expectedVersion: fu.version,
          action: "record_outcome",
          outcome: "attended",
          occurredAt: "2026-10-14T05:00:00.000Z",
        },
        h.key(),
      ),
    ).rejects.toMatchObject({ fieldErrors: { evidenceType: { key: "evidenceTypeRequired" } } });
    const onward = await h.repo.updateFollowUp(
      {
        followUpId: FU,
        expectedVersion: fu.version,
        action: "record_outcome",
        outcome: "referred_onward",
        occurredAt: "2026-10-14T05:00:00.000Z",
        evidenceType: "worker_accompanied_visit",
        note: "Accompanied to the health centre.",
      },
      h.key(),
    );
    expect(onward.data).toMatchObject({ status: "contacted", completedAt: null });
    const notReached = await h.repo.updateFollowUp(
      {
        followUpId: FU,
        expectedVersion: onward.entityVersion,
        action: "record_attempt",
        at: "2026-10-14T05:10:00.000Z",
        method: "phone",
        result: "not_reached",
      },
      h.key(),
    );
    expect(notReached.data.status).toBe("contacted");
    const declined = await h.repo.updateFollowUp(
      {
        followUpId: FU,
        expectedVersion: notReached.entityVersion,
        action: "record_outcome",
        outcome: "declined",
        occurredAt: "2026-10-14T05:20:00.000Z",
      },
      h.key(),
    );
    expect(declined.data).toMatchObject({
      status: "completed",
      completedAt: "2026-10-14T05:20:00.000Z",
      clinicianConfirmation: { status: "pending" },
    });
    fu = await load(h);
    await expect(
      h.repo.updateFollowUp(
        {
          followUpId: FU,
          expectedVersion: fu.version,
          action: "record_outcome",
          outcome: "unable_to_reach",
          occurredAt: "2026-10-14T05:30:00.000Z",
          reasonCode: "moved_away",
        },
        h.key(),
      ),
    ).rejects.toMatchObject({ code: "VALIDATION_ERROR", reason: "INVALID_TRANSITION" });
    expect((await h.repo.sync.list()).length).toBe(3);
  });

  it("clinician-recorded completion is confirmed immediately; createFollowUp validates links", async () => {
    const h = await createHarness({ personaId: PERSONA_IDS.clinAlpha1 });
    const patientId = SEED_ANCHORS.WF01_FLAGGED_REVIEW.patientId;
    const created = await h.repo.createFollowUp(
      {
        patientId,
        purpose: "post_referral_check",
        dueAt: "2026-10-18T06:00:00.000Z",
        reviewId: SEED_ANCHORS.WF01_FLAGGED_REVIEW.reviewId,
      },
      h.key(),
    );
    expect(created.data).toMatchObject({
      assignedWorkerId: null,
      assignmentHistory: [],
      notes: [],
    });
    const unreached = await h.repo.updateFollowUp(
      {
        followUpId: created.data.id,
        expectedVersion: 1,
        action: "record_outcome",
        outcome: "unable_to_reach",
        occurredAt: "2026-10-14T05:00:00.000Z",
        reasonCode: "phone_unreachable",
      },
      h.key(),
    );
    expect(unreached.data.status).toBe("unable_to_reach");
    const done = await h.repo.updateFollowUp(
      {
        followUpId: created.data.id,
        expectedVersion: unreached.entityVersion,
        action: "record_outcome",
        outcome: "repeat_screening_done",
        occurredAt: "2026-10-14T05:30:00.000Z",
        evidenceType: "clinician_confirmation",
      },
      h.key(),
    );
    expect(done.data.clinicianConfirmation).toMatchObject({
      status: "confirmed",
      by: PERSONA_IDS.clinAlpha1,
    });
    const other = SEED_ANCHORS.OVERDUE_REFERRAL;
    await expect(
      h.repo.createFollowUp(
        {
          patientId,
          purpose: "referral_attendance",
          dueAt: "2026-10-18T06:00:00.000Z",
          referralId: other.referralId,
        },
        h.key(),
      ),
    ).rejects.toMatchObject({ fieldErrors: { referralId: { key: "invalid" } } });
    await expect(
      h.repo.createFollowUp(
        {
          patientId,
          purpose: "planned_review",
          dueAt: "2026-10-18T06:00:00.000Z",
          reviewId: other.reviewId,
        },
        h.key(),
      ),
    ).rejects.toMatchObject({ fieldErrors: { reviewId: { key: "invalid" } } });
    await expect(
      h.repo.createFollowUp(
        { patientId: "missing", purpose: "planned_review", dueAt: "2026-10-18T06:00:00.000Z" },
        h.key(),
      ),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
  });

  it("attempt / outcome audits carry method, result, outcome, evidence, occurred-at and base version (HWM-08)", async () => {
    const h = await createHarness({ appId: "worker", personaId: PERSONA_IDS.chwAlpha1A });
    const fu = await load(h);
    const attempt = await h.repo.updateFollowUp(
      {
        followUpId: FU,
        expectedVersion: fu.version,
        action: "record_attempt",
        at: "2026-10-14T05:10:00.000Z",
        method: "home_visit",
        result: "reached",
      },
      h.key(),
    );
    const outcome = await h.repo.updateFollowUp(
      {
        followUpId: FU,
        expectedVersion: attempt.entityVersion,
        action: "record_outcome",
        outcome: "attended",
        occurredAt: "2026-10-14T05:20:00.000Z",
        evidenceType: "facility_register_checked",
      },
      h.key(),
    );
    const events = await h.store.getAll<AuditEvent>("auditEvents");
    expect(events.find((e) => e.id === attempt.auditEventId)).toMatchObject({
      action: "followup.attempt_recorded",
      changeSummary: {
        method: "home_visit",
        result: "reached",
        at: "2026-10-14T05:10:00.000Z",
        baseVersion: fu.version,
      },
    });
    expect(events.find((e) => e.id === outcome.auditEventId)).toMatchObject({
      action: "followup.outcome_recorded",
      changeSummary: {
        outcome: "attended",
        status: "completed",
        evidenceType: "facility_register_checked",
        reasonCode: null,
        occurredAt: "2026-10-14T05:20:00.000Z",
        baseVersion: attempt.entityVersion,
      },
    });
  });

  it("list / count: statuses, purposes, overdue, pending confirmation", async () => {
    const h = await createHarness({ personaId: PERSONA_IDS.clinAlpha1 });
    const counts = await h.repo.countFollowUps({});
    const list = await h.repo.listFollowUps({ pageSize: 200 });
    expect(counts["all"]).toBe(list.total);
    expect(list.items.every((f) => f.facilityId === FACILITY_IDS.alpha1)).toBe(true);
    expect(counts["overdue"]).toBe(
      (await h.repo.listFollowUps({ overdueOnly: true, pageSize: 200 })).total,
    );
    expect(counts["pendingConfirmation"]).toBeGreaterThan(0);
    expect(counts["assigned"]).toBe((await h.repo.listFollowUps({ statuses: ["assigned"] })).total);
    const filtered = await h.repo.listFollowUps({
      purposes: ["referral_attendance"],
      patientId: SEED_ANCHORS.WF02_FOLLOWUP_CONFLICT.patientId,
      facilityIds: [FACILITY_IDS.alpha1],
      assignedWorkerId: PERSONA_IDS.chwAlpha1A,
    });
    expect(filtered.items.map((f) => f.id)).toContain(FU);
    const unassigned = await h.repo.listFollowUps({ assignedWorkerId: null });
    expect(unassigned.items.every((f) => f.assignedWorkerId === null)).toBe(true);
  });

  it("CLN-09 getFollowUp: in scope → row; out of scope → FORBIDDEN + access.denied; unknown → null", async () => {
    const h = await createHarness({ personaId: PERSONA_IDS.clinAlpha1 });
    expect((await h.repo.getFollowUp(FU))?.id).toBe(FU);
    expect(await h.repo.getFollowUp("fu-nope")).toBeNull();
    const other = h.seed.followUps.find((f) => f.facilityId === FACILITY_IDS.beta1)!;
    await expect(h.repo.getFollowUp(other.id)).rejects.toMatchObject({ code: "FORBIDDEN" });
    const denied = (await h.store.getAll<AuditEvent>("auditEvents")).filter(
      (e) => e.action === "access.denied" && e.entityId === other.id,
    );
    expect(denied).toHaveLength(1);
  });
});
