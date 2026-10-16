import type { AuditEvent, FollowUp } from "@laif/domain";
import { DISTRICT_IDS, FACILITY_IDS, PERSONA_IDS, SEED_ANCHORS } from "@laif/mock-data";
import { describe, expect, it } from "vitest";

import { createHarness } from "./testing/harness.ts";

const denied = async (h: Awaited<ReturnType<typeof createHarness>>) =>
  (await h.store.getAll<AuditEvent>("auditEvents")).filter((e) => e.outcome === "denied");

describe("scope enforcement (WF-04, T-02)", () => {
  it("cross-facility record read → FORBIDDEN SCOPE + one access.denied audit", async () => {
    const h = await createHarness({ personaId: PERSONA_IDS.clinAlpha1 });
    const beta = SEED_ANCHORS.WF04_OTHER_FACILITY_PATIENT;
    await expect(h.repo.getPatient(beta.patientId)).rejects.toMatchObject({
      code: "FORBIDDEN",
      status: 403,
      reason: "SCOPE",
    });
    await expect(h.repo.getReview(beta.reviewId)).rejects.toMatchObject({ code: "FORBIDDEN" });
    const events = await denied(h);
    expect(events).toHaveLength(2);
    expect(events[0]).toMatchObject({
      action: "access.denied",
      category: "access",
      actorId: PERSONA_IDS.clinAlpha1,
      actorRole: "clinician",
      entityType: "patient",
      entityId: beta.patientId,
      facilityId: FACILITY_IDS.beta1,
      districtId: DISTRICT_IDS.beta,
    });
  });

  it("lists only show in-scope rows; asking for another facility is FORBIDDEN", async () => {
    const h = await createHarness({ personaId: PERSONA_IDS.clinAlpha1 });
    const page = await h.repo.listPatients({ pageSize: 200 });
    expect(page.total).toBeGreaterThan(0);
    expect(page.items.every((p) => p.facilityId === FACILITY_IDS.alpha1)).toBe(true);
    await expect(h.repo.listPatients({ facilityIds: [FACILITY_IDS.beta1] })).rejects.toMatchObject({
      code: "FORBIDDEN",
      reason: "SCOPE",
    });
    const reviews = await h.repo.listReviews({ pageSize: 200 });
    expect(reviews.items.every((r) => r.facilityId === FACILITY_IDS.alpha1)).toBe(true);
  });

  it("District-Alpha analyst asking for District Beta metrics → FORBIDDEN + denied audit", async () => {
    const h = await createHarness({ appId: "admin", personaId: PERSONA_IDS.analystAlpha });
    await expect(
      h.repo.getAggregateMetrics({ districtIds: [DISTRICT_IDS.beta] }),
    ).rejects.toMatchObject({ code: "FORBIDDEN", reason: "SCOPE" });
    const events = await denied(h);
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({
      action: "access.denied",
      actorId: PERSONA_IDS.analystAlpha,
      entityType: "district",
      entityId: DISTRICT_IDS.beta,
      districtId: DISTRICT_IDS.beta,
    });
    const own = await h.repo.getAggregateMetrics({});
    expect(own.filter.districtIds).toEqual([DISTRICT_IDS.alpha]);
  });

  it("role denial before parsing is audited (coordinator cannot decide reviews)", async () => {
    const h = await createHarness({ personaId: PERSONA_IDS.coordAlpha });
    await expect(
      h.repo.decideReview(
        {
          kind: "dismiss",
          reviewId: SEED_ANCHORS.WF01_FLAGGED_REVIEW.reviewId,
          expectedVersion: 1,
          dismissReasonCode: "other",
          reason: "Not allowed for this role anyway.",
        },
        h.key(),
      ),
    ).rejects.toMatchObject({ code: "FORBIDDEN", reason: "ROLE" });
    const events = await denied(h);
    expect(events[0]).toMatchObject({
      entityType: "review",
      entityId: SEED_ANCHORS.WF01_FLAGGED_REVIEW.reviewId,
      changeSummary: { permission: "review.decide", reason: "ROLE" },
    });
  });

  it("signed out → FORBIDDEN (reads and writes), demo tooling still works", async () => {
    const h = await createHarness({ personaId: null });
    await expect(h.repo.listPatients()).rejects.toMatchObject({
      code: "FORBIDDEN",
      reason: "ROLE",
    });
    const state = await h.repo.demo.getDemoState();
    expect(state.seedVersion).toBe("seed-v1");
  });

  it("CHW sees only own follow-ups; writing another's → FORBIDDEN TASK_REASSIGNED", async () => {
    const h = await createHarness({ appId: "worker", personaId: PERSONA_IDS.chwAlpha1A });
    const list = await h.repo.listFollowUps({ pageSize: 200 });
    expect(list.total).toBeGreaterThan(0);
    expect(list.items.every((f) => f.assignedWorkerId === PERSONA_IDS.chwAlpha1A)).toBe(true);
    const others = (await h.store.getAll<FollowUp>("followUps")).find(
      (f) => f.facilityId === FACILITY_IDS.alpha1 && f.assignedWorkerId !== PERSONA_IDS.chwAlpha1A,
    )!;
    await expect(
      h.repo.updateFollowUp(
        {
          followUpId: others.id,
          expectedVersion: others.version,
          action: "add_note",
          note: "Not mine.",
        },
        h.key(),
      ),
    ).rejects.toMatchObject({ code: "FORBIDDEN", reason: "TASK_REASSIGNED" });
    // Care-team actions are not available to a CHW at all.
    const mine = list.items[0]!;
    await expect(
      h.repo.updateFollowUp(
        { followUpId: mine.id, expectedVersion: mine.version, action: "confirm_completion" },
        h.key(),
      ),
    ).rejects.toMatchObject({ code: "FORBIDDEN", reason: "ROLE" });
  });

  it("assigning to a worker outside the facility → FORBIDDEN WORKER_NOT_AUTHORISED", async () => {
    const h = await createHarness({ personaId: PERSONA_IDS.clinAlpha1 });
    const fu = (await h.store.get<FollowUp>(
      "followUps",
      SEED_ANCHORS.WF02_FOLLOWUP_CONFLICT.followUpId,
    ))!;
    await expect(
      h.repo.updateFollowUp(
        {
          followUpId: fu.id,
          expectedVersion: fu.version,
          action: "reassign",
          assignedWorkerId: PERSONA_IDS.chwBeta1A,
          reason: "Moving the task to another worker.",
        },
        h.key(),
      ),
    ).rejects.toMatchObject({ code: "FORBIDDEN", reason: "WORKER_NOT_AUTHORISED" });
    const workers = await h.repo.listWorkers(FACILITY_IDS.alpha1);
    expect(workers.map((w) => w.id).sort()).toEqual(
      [PERSONA_IDS.chwAlpha1A, PERSONA_IDS.chwAlpha1B].sort(),
    );
    await expect(h.repo.listWorkers(FACILITY_IDS.beta1)).rejects.toMatchObject({
      code: "FORBIDDEN",
    });
  });

  it("a revoked device session denies writes (SESSION_REVOKED), re-read on every call", async () => {
    const h = await createHarness({ appId: "worker", personaId: PERSONA_IDS.chwAlpha1A });
    await h.attachDevice();
    expect((await h.repo.listPatients()).total).toBeGreaterThan(0);
    await h.repo.sync.revokeDevice();
    await expect(h.repo.listPatients()).rejects.toMatchObject({ reason: "SESSION_REVOKED" });
    await h.repo.sync.restoreDevice();
    expect((await h.repo.listPatients()).total).toBeGreaterThan(0);
  });
});
