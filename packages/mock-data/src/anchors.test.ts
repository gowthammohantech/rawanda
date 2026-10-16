import { deriveInstructionProgress, isFollowUpOverdue, isReferralOverdue } from "@laif/domain";
import { describe, expect, it } from "vitest";

import { SEED_ANCHORS, type SeedAnchor } from "./anchors.ts";
import { DEMO_PERSONAS, PERSONA_IDS } from "./reference/personas.ts";
import { SEED_IDS } from "./seed/ids.ts";
import { createSeed } from "./seed/generate.ts";

const seed = createSeed();
const now = new Date(seed.meta.demoClockIso);
const A = SEED_ANCHORS;

const get = <T extends { id: string }>(rows: T[], id: string | undefined): T => {
  const row = rows.find((r) => r.id === id);
  if (!row) throw new Error(`missing ${id}`);
  return row;
};

describe("SEED_ANCHORS exist", () => {
  it.each(Object.entries(SEED_ANCHORS) as [string, SeedAnchor][])(
    "%s resolves to seed records",
    (_name, anchor) => {
      if (anchor.patientId) get(seed.patients, anchor.patientId);
      for (const id of anchor.patientIds ?? []) get(seed.patients, id);
      if (anchor.screeningId) get(seed.screenings, anchor.screeningId);
      if (anchor.reviewId) get(seed.reviews, anchor.reviewId);
      if (anchor.referralId) get(seed.referrals, anchor.referralId);
      if (anchor.followUpId) get(seed.followUps, anchor.followUpId);
      if (anchor.careInstructionId) get(seed.careInstructions, anchor.careInstructionId);
      if (anchor.personaId) get(seed.personas, anchor.personaId);
      if (anchor.facilityId) get(seed.facilities, anchor.facilityId);
      // Every linked record belongs to the anchored patient.
      for (const rows of [
        seed.screenings,
        seed.reviews,
        seed.referrals,
        seed.followUps,
        seed.careInstructions,
      ]) {
        for (const id of [
          anchor.screeningId,
          anchor.reviewId,
          anchor.referralId,
          anchor.followUpId,
          anchor.careInstructionId,
        ]) {
          const row = rows.find((r) => r.id === id);
          if (row && anchor.patientId) expect(row.patientId).toBe(anchor.patientId);
        }
      }
    },
  );
});

describe("SEED_ANCHORS are in their documented state", () => {
  it("WF01_FLAGGED_REVIEW: Alpha-1, pending, assigned to persona-clin-alpha1, BP + glucose with units", () => {
    const r = get(seed.reviews, A.WF01_FLAGGED_REVIEW.reviewId);
    const s = get(seed.screenings, A.WF01_FLAGGED_REVIEW.screeningId);
    expect(r).toMatchObject({
      status: "pending",
      assignedClinicianId: "persona-clin-alpha1",
      facilityId: SEED_IDS.facilities.alpha1,
    });
    expect(s.systolic).not.toBeNull();
    expect(s.glucoseValue).not.toBeNull();
    expect(s.glucoseUnit).toBe("mmol/L");
    expect(s.flag?.triggeringObservations.map((o) => o.code)).toEqual([
      "SYSTOLIC",
      "DIASTOLIC",
      "GLUCOSE",
    ]);
  });

  it("WF01_WORKER_COMPLETED_FU: completed by a worker, confirmation pending", () => {
    const fu = get(seed.followUps, A.WF01_WORKER_COMPLETED_FU.followUpId);
    expect(fu.status).toBe("completed");
    expect(fu.clinicianConfirmation.status).toBe("pending");
    expect(get(seed.personas, fu.outcome?.recordedBy).role).toBe("community_health_worker");
  });

  it("WF02_FOLLOWUP_CONFLICT: open follow-up at version 3", () => {
    const fu = get(seed.followUps, A.WF02_FOLLOWUP_CONFLICT.followUpId);
    expect(fu.version).toBe(3);
    expect(["assigned", "contacted", "reassigned"]).toContain(fu.status);
    expect(fu.assignedWorkerId).toBe(PERSONA_IDS.chwAlpha1A);
  });

  it("WF03_DISMISSABLE_FLAG: pending review with a repeat reading in the evidence", () => {
    expect(get(seed.reviews, A.WF03_DISMISSABLE_FLAG.reviewId).status).toBe("pending");
    const s = get(seed.screenings, A.WF03_DISMISSABLE_FLAG.screeningId);
    expect(s.observations.some((o) => o.code === "SYSTOLIC_REPEAT")).toBe(true);
  });

  it("WF04_OTHER_FACILITY_PATIENT: Beta-1 patient + pending review", () => {
    expect(get(seed.patients, A.WF04_OTHER_FACILITY_PATIENT.patientId).facilityId).toBe(
      SEED_IDS.facilities.beta1,
    );
    expect(get(seed.reviews, A.WF04_OTHER_FACILITY_PATIENT.reviewId).status).toBe("pending");
  });

  it("MISSING_UNIT_SCREENING / MISSING_UNIT_DRAFT", () => {
    const s = get(seed.screenings, A.MISSING_UNIT_SCREENING.screeningId);
    expect(s).toMatchObject({ source: "imported", glucoseUnit: null, status: "review_required" });
    expect(s.flag).toMatchObject({ evaluable: false, reasonCodes: ["GLUCOSE_UNIT_MISSING"] });
    expect(get(seed.reviews, A.MISSING_UNIT_SCREENING.reviewId).status).toBe("in_review");
    const d = get(seed.screenings, A.MISSING_UNIT_DRAFT.screeningId);
    expect(d).toMatchObject({
      status: "draft",
      glucoseUnit: null,
      workerId: PERSONA_IDS.chwAlpha1A,
    });
    expect(d.glucoseValue).not.toBeNull();
  });

  it("DUPLICATE_IDENTITY_PAIR: possible duplicates referencing each other", () => {
    const [a, b] = A.DUPLICATE_IDENTITY_PAIR.patientIds.map((id) => get(seed.patients, id));
    expect(a?.identityStatus).toBe("possible_duplicate");
    expect(b?.identityStatus).toBe("possible_duplicate");
    expect(a?.duplicateCandidateIds).toEqual([b?.id]);
    expect(b?.duplicateCandidateIds).toEqual([a?.id]);
  });

  it("AMENDED_SCREENING: one amendment, original retained", () => {
    const s = get(seed.screenings, A.AMENDED_SCREENING.screeningId);
    expect(s.amendments).toHaveLength(1);
    expect(s.amendments[0]).toMatchObject({ field: "systolic", before: 128, after: 126 });
    expect(s.systolic).toBe(128);
    expect(s.version).toBe(4);
  });

  it("OVERDUE_REFERRAL / OVERDUE_FOLLOWUP", () => {
    const r = get(seed.referrals, A.OVERDUE_REFERRAL.referralId);
    expect(r.status).toBe("scheduled");
    expect(isReferralOverdue(r, now)).toBe(true);
    const fu = get(seed.followUps, A.OVERDUE_FOLLOWUP.followUpId);
    expect(fu.status).toBe("assigned");
    expect(isFollowUpOverdue(fu, now)).toBe(true);
  });

  it("CANCELLED_REFERRAL + REPLACEMENT_REFERRAL on the same review", () => {
    const c = get(seed.referrals, A.CANCELLED_REFERRAL.referralId);
    const r = get(seed.referrals, A.REPLACEMENT_REFERRAL.referralId);
    expect(c.status).toBe("cancelled_with_reason");
    expect(c.cancelled?.reason.length).toBeGreaterThanOrEqual(10);
    expect(r.reviewId).toBe(c.reviewId);
    expect(r.status).toBe("scheduled");
  });

  it("COMPLETED_REFERRAL_WITH_EVIDENCE", () => {
    const r = get(seed.referrals, A.COMPLETED_REFERRAL_WITH_EVIDENCE.referralId);
    expect(r.status).toBe("completed");
    expect(r.completionEvidence).toMatchObject({ type: "facility_attendance_record" });
  });

  it("UNABLE_TO_REACH_FOLLOWUP", () => {
    const fu = get(seed.followUps, A.UNABLE_TO_REACH_FOLLOWUP.followUpId);
    expect(fu.status).toBe("unable_to_reach");
    expect(fu.attempts.filter((a) => a.result === "not_reached")).toHaveLength(2);
  });

  it("COMPLETED_FOLLOWUP_WITH_INSTRUCTION (SCN-05)", () => {
    const fu = get(seed.followUps, A.COMPLETED_FOLLOWUP_WITH_INSTRUCTION.followUpId);
    const ci = get(seed.careInstructions, A.COMPLETED_FOLLOWUP_WITH_INSTRUCTION.careInstructionId);
    expect(fu.status).toBe("completed");
    expect(fu.outcome?.evidenceType).not.toBeNull();
    expect(ci).toMatchObject({ status: "released", sourceType: "follow_up", sourceId: fu.id });
    expect(deriveInstructionProgress(ci, fu)).toBe("completed");
  });

  it("CTZ_P1_UNRELEASED_REFERRAL: created, never a care instruction", () => {
    const r = get(seed.referrals, A.CTZ_P1_UNRELEASED_REFERRAL.referralId);
    expect(r.status).toBe("created");
    expect(seed.careInstructions.some((c) => c.sourceId === r.id)).toBe(false);
  });

  it("CTZ_P1_APPOINTMENT_INSTRUCTION: 19 Oct 10:30 Kigali", () => {
    const ci = get(seed.careInstructions, A.CTZ_P1_APPOINTMENT_INSTRUCTION.careInstructionId);
    expect(ci).toMatchObject({
      kind: "appointment",
      status: "released",
      appointmentAt: "2026-10-19T08:30:00.000Z",
    });
  });

  it("CTZ-P2 anchors", () => {
    expect(get(seed.reviews, A.CTZ_P2_DISMISSED_SCREENING.reviewId).status).toBe(
      "dismissed_with_reason",
    );
    expect(get(seed.reviews, A.CTZ_P2_AWAITING_REVIEW_SCREENING.reviewId).status).toBe("pending");
    expect(
      get(seed.careInstructions, A.CTZ_P2_WITHDRAWN_INSTRUCTION.careInstructionId).status,
    ).toBe("withdrawn");
    const p2Reminders = seed.reminders.filter(
      (r) => r.patientId === A.CTZ_P2_DISMISSED_SCREENING.patientId,
    );
    expect(p2Reminders.map((r) => [r.status, r.cancelReason])).toEqual([
      ["cancelled", "opted_out"],
    ]);
  });

  it("CTZ_P3_WITHDRAWN_PATIENT (SCN-10): consent withdrawn, 2 reminders cancelled", () => {
    const p = get(seed.patients, A.CTZ_P3_WITHDRAWN_PATIENT.patientId);
    expect(p.consentState).toBe("withdrawn");
    const rems = seed.reminders.filter((r) => r.patientId === p.id);
    expect(rems.map((r) => [r.status, r.cancelReason])).toEqual([
      ["cancelled", "consent_withdrawn"],
      ["cancelled", "consent_withdrawn"],
    ]);
  });

  it("CTZ-P1 reminders: 2 delivered (1 acknowledged) and 1 scheduled", () => {
    const rems = seed.reminders.filter(
      (r) => r.patientId === A.CTZ_P1_UNRELEASED_REFERRAL.patientId,
    );
    expect(rems.map((r) => r.status).sort()).toEqual([
      "acknowledged",
      "delivered_simulated",
      "scheduled",
    ]);
    expect(rems.filter((r) => r.deliveredAt !== null)).toHaveLength(2);
  });

  it("CTZ_P4_REPRESENTED_PATIENT: no-action result + released follow-up", () => {
    const a = A.CTZ_P4_REPRESENTED_PATIENT;
    expect(get(seed.screenings, a.screeningId).status).toBe("no_review_required");
    expect(get(seed.followUps, a.followUpId).purpose).toBe("planned_review");
    expect(get(seed.careInstructions, a.careInstructionId).status).toBe("released");
    expect(get(seed.personas, a.personaId).linkedPatientIds).toEqual([a.patientId]);
  });

  it("SCN01_NORMAL_SCREENING / SCN03_DISMISSED_REVIEW", () => {
    expect(get(seed.screenings, A.SCN01_NORMAL_SCREENING.screeningId)).toMatchObject({
      status: "no_review_required",
      workerId: PERSONA_IDS.chwAlpha1A,
      facilityId: SEED_IDS.facilities.alpha1,
    });
    const r = get(seed.reviews, A.SCN03_DISMISSED_REVIEW.reviewId);
    expect(r.status).toBe("dismissed_with_reason");
    expect(seed.referrals.some((x) => x.reviewId === r.id)).toBe(false);
    const event = seed.auditEvents.find(
      (e) => e.entityId === r.id && e.action === "review.dismissed",
    );
    expect(event).toMatchObject({ actorId: "persona-clin-alpha1", actorRole: "clinician" });
    expect(event?.changeSummary).toMatchObject({ reasonCode: "repeat_reading_acceptable" });
  });
});

describe("DEMO_PERSONAS (task 3)", () => {
  const expected: Array<[string, string, string[], string[], string[], boolean]> = [
    ["persona-clin-alpha1", "clinician", ["clinical"], ["fac-alpha-1"], [], false],
    ["persona-nurse-alpha2", "nurse_reviewer", ["clinical"], ["fac-alpha-2"], [], false],
    [
      "persona-coord-alpha",
      "facility_coordinator",
      ["clinical"],
      ["fac-alpha-1", "fac-alpha-2"],
      [],
      false,
    ],
    ["persona-clin-beta1", "clinician", ["clinical"], ["fac-beta-1"], [], false],
    ["persona-chw-alpha1-a", "community_health_worker", ["worker"], ["fac-alpha-1"], [], false],
    ["persona-chw-alpha1-b", "community_health_worker", ["worker"], ["fac-alpha-1"], [], false],
    ["persona-chw-alpha2-a", "community_health_worker", ["worker"], ["fac-alpha-2"], [], false],
    ["persona-chw-beta1-a", "community_health_worker", ["worker"], ["fac-beta-1"], [], false],
    [
      "persona-sup-alpha",
      "field_supervisor",
      ["worker"],
      ["fac-alpha-1", "fac-alpha-2"],
      [],
      false,
    ],
    ["persona-lead-programme", "programme_lead", ["admin"], [], [], true],
    ["persona-analyst-alpha", "district_analyst", ["admin"], [], ["dist-alpha"], false],
    ["persona-fmgr-alpha1", "facility_manager", ["admin"], ["fac-alpha-1"], [], false],
    ["persona-auditor-programme", "auditor", ["admin"], [], [], true],
    ["persona-citizen-1", "citizen", ["citizen"], [], [], false],
    ["persona-citizen-2", "citizen", ["citizen"], [], [], false],
    ["persona-citizen-withdrawn", "citizen", ["citizen"], [], [], false],
    ["persona-citizen-rep", "citizen", ["citizen"], [], [], false],
    ["persona-citizen-pending", "citizen", ["citizen"], [], [], false],
  ];

  it("has exactly the 18 personas with role, apps and scope", () => {
    expect(seed.personas).toHaveLength(18);
    expect(
      seed.personas.map((p) => [
        p.id,
        p.role,
        p.appIds,
        p.facilityIds,
        p.districtIds,
        p.programmeWide,
      ]),
    ).toEqual(expected);
  });

  it("gives staff a pseudonymous workerCode and citizens none", () => {
    for (const p of seed.personas) {
      if (p.role === "citizen") expect(p.workerCode).toBeNull();
      else expect(p.workerCode).toMatch(/^[A-Z]{2}-\d{3}$/);
    }
    expect(seed.personas.find((p) => p.id === "persona-chw-alpha1-a")?.workerCode).toBe("HW-014");
  });

  it("links citizen personas CTZ-P1…P5 to their patients", () => {
    const links = Object.fromEntries(
      seed.personas
        .filter((p) => p.role === "citizen")
        .map((p) => [p.id, p.linkedPatientIds.length]),
    );
    expect(links).toEqual({
      "persona-citizen-1": 1,
      "persona-citizen-2": 1,
      "persona-citizen-withdrawn": 1,
      "persona-citizen-rep": 1,
      "persona-citizen-pending": 0,
    });
    expect(DEMO_PERSONAS.find((p) => p.id === PERSONA_IDS.citizenRep)?.citizenLink).toBe(
      "legal_representative",
    );
    const self = seed.personas.find((p) => p.id === "persona-citizen-1");
    expect(get(seed.patients, self?.linkedPatientIds[0]).displayName).toBe(self?.displayName);
  });
});
