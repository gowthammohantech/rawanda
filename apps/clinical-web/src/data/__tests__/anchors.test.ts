/**
 * CLN-02: every clinical SEED_ANCHORS entry is reachable through the clinical repository (as a
 * persona of the anchor's facility) with its documented state; resets are deterministic; the
 * actor is scoped to the ACTIVE facility (cross-facility → FORBIDDEN + `access.denied`).
 */
import { FACILITY_IDS, PERSONA_IDS, SEED_ANCHORS } from "@laif/mock-data";
import type { AuditEvent, FacilityId } from "@laif/domain";
import { describe, expect, it } from "vitest";

import { createTestClinicalRepo } from "../../test/test-repository.ts";

const PERSONA_FOR: Record<string, string> = {
  [FACILITY_IDS.alpha1]: PERSONA_IDS.clinAlpha1,
  [FACILITY_IDS.alpha2]: PERSONA_IDS.nurseAlpha2,
  [FACILITY_IDS.beta1]: PERSONA_IDS.clinBeta1,
};

const repoFor = (facilityId: FacilityId) =>
  createTestClinicalRepo({ personaId: PERSONA_FOR[facilityId] as string, facilityId });

async function reviewStatus(facilityId: FacilityId, reviewId: string) {
  const { repo } = await repoFor(facilityId);
  return (await repo.getReview(reviewId))?.review.status;
}

async function followUp(facilityId: FacilityId, patientId: string, id: string) {
  const { repo } = await repoFor(facilityId);
  return (await repo.listFollowUps({ patientId, pageSize: 100 })).items.find((f) => f.id === id);
}

async function referral(facilityId: FacilityId, patientId: string, id: string) {
  const { repo } = await repoFor(facilityId);
  return (await repo.listReferrals({ patientId, pageSize: 100 })).items.find((r) => r.id === id);
}

async function screening(facilityId: FacilityId, patientId: string, id: string) {
  const { repo } = await repoFor(facilityId);
  return (await repo.listScreenings({ patientId, pageSize: 100 })).items.find((s) => s.id === id);
}

describe("clinical SEED_ANCHORS through the clinical repository", () => {
  it("WF01_FLAGGED_REVIEW: pending, assigned to the clinician, BP + glucose with units", async () => {
    const a = SEED_ANCHORS.WF01_FLAGGED_REVIEW;
    const { repo } = await repoFor(a.facilityId);
    const detail = await repo.getReview(a.reviewId);
    expect(detail?.review.status).toBe("pending");
    expect(detail?.review.assignedClinicianId).toBe(a.personaId);
    expect(detail?.screening?.id).toBe(a.screeningId);
    expect(detail?.screening?.glucoseUnit).not.toBeNull();
    expect(detail?.screening?.rulesetVersion).toBe("demo-ruleset-2026.10-v1");
  });

  it("WF01_WORKER_COMPLETED_FU: completed by the worker, clinician confirmation pending", async () => {
    const a = SEED_ANCHORS.WF01_WORKER_COMPLETED_FU;
    const fu = await followUp(a.facilityId, a.patientId, a.followUpId);
    expect(fu?.status).toBe("completed");
    expect(fu?.outcome).not.toBeNull();
    expect(fu?.clinicianConfirmation.status).toBe("pending");
  });

  it("WF02_FOLLOWUP_CONFLICT: open follow-up at version 3", async () => {
    const a = SEED_ANCHORS.WF02_FOLLOWUP_CONFLICT;
    const fu = await followUp(a.facilityId, a.patientId, a.followUpId);
    expect(fu?.version).toBe(3);
    expect(fu?.assignedWorkerId).toBe(a.personaId);
  });

  it("WF03_DISMISSABLE_FLAG and WF04_OTHER_FACILITY_PATIENT: pending reviews", async () => {
    const w3 = SEED_ANCHORS.WF03_DISMISSABLE_FLAG;
    const w4 = SEED_ANCHORS.WF04_OTHER_FACILITY_PATIENT;
    expect(await reviewStatus(w3.facilityId, w3.reviewId)).toBe("pending");
    expect(await reviewStatus(w4.facilityId, w4.reviewId)).toBe("pending");
  });

  it("MISSING_UNIT_SCREENING: glucose without unit", async () => {
    const a = SEED_ANCHORS.MISSING_UNIT_SCREENING;
    const s = await screening(a.facilityId, a.patientId, a.screeningId);
    expect(s?.glucoseUnit).toBeNull();
    expect(await reviewStatus(a.facilityId, a.reviewId)).toBe("in_review");
  });

  it("DUPLICATE_IDENTITY_PAIR: two possible duplicates referencing each other", async () => {
    const a = SEED_ANCHORS.DUPLICATE_IDENTITY_PAIR;
    const { repo } = await repoFor(a.facilityId);
    const [first, second] = await Promise.all(a.patientIds.map((id) => repo.getPatient(id)));
    expect(first?.identityStatus).toBe("possible_duplicate");
    expect(second?.identityStatus).toBe("possible_duplicate");
    expect(first?.duplicateCandidateIds).toContain(second?.id);
  });

  it("AMENDED_SCREENING: exactly one amendment", async () => {
    const a = SEED_ANCHORS.AMENDED_SCREENING;
    const s = await screening(a.facilityId, a.patientId, a.screeningId);
    expect(s?.amendments).toHaveLength(1);
  });

  it("referral anchors: overdue (scheduled), cancelled, completed with evidence", async () => {
    const o = SEED_ANCHORS.OVERDUE_REFERRAL;
    const c = SEED_ANCHORS.CANCELLED_REFERRAL;
    const d = SEED_ANCHORS.COMPLETED_REFERRAL_WITH_EVIDENCE;
    expect((await referral(o.facilityId, o.patientId, o.referralId))?.status).toBe("scheduled");
    expect((await referral(c.facilityId, c.patientId, c.referralId))?.status).toBe(
      "cancelled_with_reason",
    );
    expect((await referral(d.facilityId, d.patientId, d.referralId))?.status).toBe("completed");
  });

  it("follow-up anchors: overdue (assigned) and unable to reach", async () => {
    const o = SEED_ANCHORS.OVERDUE_FOLLOWUP;
    const u = SEED_ANCHORS.UNABLE_TO_REACH_FOLLOWUP;
    expect((await followUp(o.facilityId, o.patientId, o.followUpId))?.status).toBe("assigned");
    expect((await followUp(u.facilityId, u.patientId, u.followUpId))?.status).toBe(
      "unable_to_reach",
    );
  });

  it("seeds baseline audit events so the audit explorer is non-empty", async () => {
    const { repo } = await repoFor(FACILITY_IDS.alpha1);
    expect((await repo.listAuditEvents()).total).toBeGreaterThan(0);
  });
});

describe("clinical repository scope and reset", () => {
  it("cross-facility read → FORBIDDEN and an access.denied audit event (T-02)", async () => {
    const { repo, store } = await repoFor(FACILITY_IDS.alpha1);
    const w4 = SEED_ANCHORS.WF04_OTHER_FACILITY_PATIENT;
    await expect(repo.getReview(w4.reviewId)).rejects.toMatchObject({ code: "FORBIDDEN" });
    const denied = (await store.getAll<AuditEvent>("auditEvents")).filter(
      (e) => e.action === "access.denied" && e.entityId === w4.reviewId,
    );
    expect(denied).toHaveLength(1);
    expect(denied[0]?.actorId).toBe(PERSONA_IDS.clinAlpha1);
  });

  it("narrows the actor to the ACTIVE facility (coordinator in Alpha-2 cannot read Alpha-1)", async () => {
    const a = SEED_ANCHORS.WF01_FLAGGED_REVIEW;
    const { repo, session } = await createTestClinicalRepo({
      personaId: PERSONA_IDS.coordAlpha,
      facilityId: FACILITY_IDS.alpha2,
    });
    await expect(repo.getPatient(a.patientId)).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect(session.setActiveFacility(FACILITY_IDS.alpha1)).toBe(true);
    expect((await repo.getPatient(a.patientId))?.id).toBe(a.patientId);
  });

  it("two consecutive resets produce identical DB snapshots", async () => {
    const { repo } = await repoFor(FACILITY_IDS.alpha1);
    await repo.startReview(
      { reviewId: SEED_ANCHORS.WF01_FLAGGED_REVIEW.reviewId, expectedVersion: 1 },
      crypto.randomUUID(),
    );
    const first = await repo.demo.resetDemo();
    const second = await repo.demo.resetDemo();
    expect(second.datasetHash).toBe(first.datasetHash);
    expect(second.clockIso).toBe(first.clockIso);
  });

  it.each([
    [PERSONA_IDS.clinAlpha1, FACILITY_IDS.alpha1],
    [PERSONA_IDS.nurseAlpha2, FACILITY_IDS.alpha2],
    [PERSONA_IDS.coordAlpha, FACILITY_IDS.alpha1],
    [PERSONA_IDS.clinBeta1, FACILITY_IDS.beta1],
  ])(
    "%s can reset the demo; the reset is audited with the actor",
    async (personaId, facilityId) => {
      const { repo, store } = await createTestClinicalRepo({ personaId, facilityId });
      await repo.demo.resetDemo();
      const resets = (await store.getAll<AuditEvent>("auditEvents")).filter(
        (e) => e.action === "demo.reset",
      );
      expect(resets).toHaveLength(1);
      expect(resets[0]?.actorId).toBe(personaId);
    },
  );
});
