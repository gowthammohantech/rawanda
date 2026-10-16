import type { AuditEvent, FollowUp, Review } from "@laif/domain";
import { FACILITY_IDS, PERSONA_IDS, SEED_ANCHORS } from "@laif/mock-data";
import { matchesReviewQueueTab, REVIEW_QUEUE_TABS } from "@laif/domain";
import { describe, expect, it } from "vitest";

import { createHarness } from "../testing/harness.ts";

const FLAGGED = SEED_ANCHORS.WF01_FLAGGED_REVIEW.reviewId;

describe("reviews service", () => {
  it("countReviews reconciles with listReviews for every tab", async () => {
    const h = await createHarness({ personaId: PERSONA_IDS.clinAlpha1 });
    const counts = await h.repo.countReviews({});
    const all = (await h.repo.listReviews({ pageSize: 200 })).items;
    const ctx = { now: h.clock.now(), personaId: PERSONA_IDS.clinAlpha1 };
    for (const tab of REVIEW_QUEUE_TABS) {
      expect(counts[tab], tab).toBe(all.filter((r) => matchesReviewQueueTab(r, tab, ctx)).length);
    }
    expect(counts.all).toBe(all.length);
    expect(counts.pending).toBeGreaterThan(0);
    const pending = await h.repo.listReviews({ statuses: ["pending", "in_review"], pageSize: 200 });
    expect(pending.total).toBe(counts.pending);
    const created = pending.items.map((r) => r.createdAt);
    expect([...created].sort()).toEqual(created);
    const mine = await h.repo.listReviews({ assignedClinicianId: PERSONA_IDS.clinAlpha1 });
    expect(mine.items.every((r) => r.assignedClinicianId === PERSONA_IDS.clinAlpha1)).toBe(true);
    const filtered = await h.repo.countReviews({
      priorities: ["urgent_demo"],
      origins: ["rule_flag"],
      facilityIds: [FACILITY_IDS.alpha1],
      overdueOnly: true,
      patientId: SEED_ANCHORS.WF01_FLAGGED_REVIEW.patientId,
    });
    expect(filtered.all).toBeLessThanOrEqual(counts.all);
  });

  it("getReview returns the detail bundle and is audited once per minute", async () => {
    const h = await createHarness({ personaId: PERSONA_IDS.clinAlpha1 });
    const anchor = SEED_ANCHORS.OVERDUE_REFERRAL;
    const detail = await h.repo.getReview(anchor.reviewId);
    expect(detail?.referrals.map((r) => r.id)).toContain(anchor.referralId);
    expect(detail?.followUps.length).toBeGreaterThan(0);
    await h.repo.getReview(anchor.reviewId);
    const views = (await h.store.getAll<AuditEvent>("auditEvents")).filter(
      (e) => e.action === "review.viewed",
    );
    expect(views).toHaveLength(1);
    expect(await h.repo.getReview("missing")).toBeNull();
  });

  it("startReview: open, re-open by me (no change), take over needs a reason", async () => {
    const h = await createHarness({ personaId: PERSONA_IDS.clinAlpha1 });
    const started = await h.repo.startReview({ reviewId: FLAGGED, expectedVersion: 1 }, h.key());
    expect(started.data).toMatchObject({ status: "in_review", startedBy: PERSONA_IDS.clinAlpha1 });
    const again = await h.repo.startReview(
      { reviewId: FLAGGED, expectedVersion: started.entityVersion },
      h.key(),
    );
    expect(again.entityVersion).toBe(started.entityVersion);

    h.as(PERSONA_IDS.coordAlpha);
    await expect(
      h.repo.startReview({ reviewId: FLAGGED, expectedVersion: started.entityVersion }, h.key()),
    ).rejects.toMatchObject({ reason: "ROLE" });
    // A nurse reviewer at Alpha-2 has no Alpha-1 scope.
    h.as(PERSONA_IDS.nurseAlpha2);
    await expect(
      h.repo.startReview({ reviewId: FLAGGED, expectedVersion: started.entityVersion }, h.key()),
    ).rejects.toMatchObject({ reason: "SCOPE" });
  });

  it("taking over another clinician's review requires an audited reason", async () => {
    const h = await createHarness({ personaId: PERSONA_IDS.clinAlpha1 });
    const original = (await h.store.get<Review>("reviews", FLAGGED))!;
    // Another reviewer opened it (stored directly: Alpha-1 has a single clinician persona).
    const review: Review = {
      ...original,
      status: "in_review",
      startedBy: PERSONA_IDS.nurseAlpha2,
      assignedClinicianId: PERSONA_IDS.nurseAlpha2,
      version: original.version + 1,
    };
    await h.store.put("reviews", review);
    await expect(
      h.repo.startReview({ reviewId: FLAGGED, expectedVersion: review.version }, h.key()),
    ).rejects.toMatchObject({
      code: "VALIDATION_ERROR",
      fieldErrors: { takeOverReason: { key: "required" } },
    });
    const taken = await h.repo.startReview(
      {
        reviewId: FLAGGED,
        expectedVersion: review.version,
        takeOverReason: "Original reviewer is on leave today.",
      },
      h.key(),
    );
    expect(taken.data).toMatchObject({
      startedBy: PERSONA_IDS.clinAlpha1,
      assignedClinicianId: PERSONA_IDS.clinAlpha1,
    });
    const event = (await h.store.getAll<AuditEvent>("auditEvents")).find(
      (e) => e.id === taken.auditEventId,
    );
    expect(event).toMatchObject({
      action: "review.taken_over",
      justification: "Original reviewer is on leave today.",
      changeSummary: { from: PERSONA_IDS.nurseAlpha2 },
    });
  });

  it("decision kinds: repeat screening / planned review create follow-ups; no further action creates nothing", async () => {
    const h = await createHarness({ personaId: PERSONA_IDS.clinAlpha1 });
    const followUps = (await h.store.getAll<FollowUp>("followUps")).length;
    const repeat = await h.repo.decideReview(
      {
        kind: "request_repeat_screening",
        reviewId: FLAGGED,
        expectedVersion: 1,
        assignedWorkerId: PERSONA_IDS.chwAlpha1A,
        dueAt: "2026-10-16T06:00:00.000Z",
        instructionsForWorker: "Repeat BP after rest.",
      },
      h.key(),
    );
    expect(repeat.data.decision?.kind).toBe("request_repeat_screening");
    const created = (await h.store.getAll<FollowUp>("followUps")).filter(
      (f) => f.reviewId === FLAGGED,
    );
    expect(created).toHaveLength(1);
    expect(created[0]).toMatchObject({
      purpose: "repeat_screening",
      status: "assigned",
      assignedWorkerId: PERSONA_IDS.chwAlpha1A,
      notes: [{ text: "Repeat BP after rest." }],
    });

    const other = SEED_ANCHORS.WF03_DISMISSABLE_FLAG.reviewId;
    const planned = await h.repo.decideReview(
      {
        kind: "plan_follow_up",
        reviewId: other,
        expectedVersion: 1,
        dueAt: "2026-10-30T06:00:00.000Z",
        note: "Review again in two weeks.",
      },
      h.key(),
    );
    expect(planned.data.status).toBe("action_recorded");
    const plannedFu = (await h.store.getAll<FollowUp>("followUps")).find(
      (f) => f.reviewId === other,
    )!;
    expect(plannedFu).toMatchObject({
      purpose: "planned_review",
      assignedWorkerId: null,
      assignmentHistory: [],
    });
    expect((await h.store.getAll("followUps")).length).toBe(followUps + 2);

    await expect(
      h.repo.decideReview(
        {
          kind: "plan_follow_up",
          reviewId: other,
          expectedVersion: planned.entityVersion,
          dueAt: "2026-10-01T06:00:00.000Z",
          note: "Due date in the past.",
        },
        h.key(),
      ),
    ).rejects.toMatchObject({ fieldErrors: { dueAt: { key: "dateMustBeFuture" } } });
  });

  it("no_further_action records the assessment only", async () => {
    const h = await createHarness({ personaId: PERSONA_IDS.clinAlpha1 });
    const result = await h.repo.decideReview(
      {
        kind: "no_further_action",
        reviewId: FLAGGED,
        expectedVersion: 1,
        note: "Assessed, managed in clinic.",
      },
      h.key(),
    );
    expect(result.data).toMatchObject({
      status: "action_recorded",
      decisionReason: "Assessed, managed in clinic.",
    });
    expect((await h.store.getAll<FollowUp>("followUps")).some((f) => f.reviewId === FLAGGED)).toBe(
      false,
    );
    await expect(
      h.repo.decideReview(
        {
          kind: "request_repeat_screening",
          reviewId: SEED_ANCHORS.WF03_DISMISSABLE_FLAG.reviewId,
          expectedVersion: 1,
          assignedWorkerId: PERSONA_IDS.chwBeta1A,
          dueAt: "2026-10-16T06:00:00.000Z",
          instructionsForWorker: "Repeat BP after rest.",
        },
        h.key(),
      ),
    ).rejects.toMatchObject({ code: "FORBIDDEN", reason: "WORKER_NOT_AUTHORISED" });
  });
});
