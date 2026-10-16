/** Test-only builders (not exported from the package index). */
import type { FollowUp } from "../entities/follow-up.ts";
import type { Referral } from "../entities/referral.ts";
import type { Screening } from "../entities/screening.ts";
import { asId, type PersonaId, type ReviewId } from "../ids.ts";
import type { DemoRuleset } from "../rules/types.ts";

export const T0 = "2026-10-14T06:00:00.000Z";

const base = { version: 1, createdAt: T0, updatedAt: T0, synthetic: true as const };

export function makeRuleset(overrides: Partial<DemoRuleset> = {}): DemoRuleset {
  return {
    version: "test-ruleset-v1",
    status: "active",
    label: "DEMO_RULE_NOT_CLINICALLY_VALIDATED",
    approvedBy: null,
    effectiveFrom: "2026-01-01T00:00:00.000Z",
    requiredInputs: ["systolic", "diastolic"],
    thresholds: {
      DEMO_SYSTOLIC_REVIEW_AT_OR_ABOVE: 150,
      DEMO_DIASTOLIC_REVIEW_AT_OR_ABOVE: 100,
      DEMO_GLUCOSE_REVIEW_AT_OR_ABOVE_MMOL: { fasting: 8, non_fasting: 12, not_recorded: 12 },
    },
    plausibility: {
      systolic: { min: 60, max: 260 },
      diastolic: { min: 30, max: 160 },
      glucoseMmol: { min: 1, max: 35 },
      glucoseMgDl: { min: 18, max: 630 },
    },
    synthetic: true,
    ...overrides,
  };
}

export function makeScreening(overrides: Partial<Screening> = {}): Screening {
  return {
    ...base,
    id: asId("scr-1"),
    patientId: asId("pat-1"),
    workerId: asId("persona-chw-1"),
    facilityId: asId("fac-1"),
    districtId: asId("dis-1"),
    measuredAt: T0,
    systolic: 130,
    diastolic: 85,
    glucoseValue: 6.1,
    glucoseUnit: "mmol/L",
    glucoseContext: "fasting",
    observations: [],
    source: "worker_mobile",
    rulesetVersion: "test-ruleset-v1",
    status: "submitted",
    flag: null,
    clientMutationId: "cm-1",
    captureDurationSeconds: 120,
    notes: "",
    amendments: [],
    ...overrides,
  };
}

export function makeReferral(overrides: Partial<Referral> = {}): Referral {
  return {
    ...base,
    id: asId("ref-1"),
    patientId: asId("pat-1"),
    reviewId: asId("rev-1"),
    destination: "Demo Facility Alpha-2",
    requestedAt: T0,
    dueAt: "2026-10-20T06:00:00.000Z",
    status: "created",
    completedAt: null,
    completionEvidence: null,
    facilityId: asId("fac-1"),
    destinationFacilityId: asId("fac-2"),
    assignedWorkerId: null,
    priority: "routine",
    appointmentAt: null,
    cancelled: null,
    ...overrides,
  };
}

export function makeFollowUp(overrides: Partial<FollowUp> = {}): FollowUp {
  return {
    ...base,
    id: asId("fu-1"),
    patientId: asId("pat-1"),
    referralId: null,
    reviewId: asId<ReviewId>("rev-1"),
    facilityId: asId("fac-1"),
    assignedWorkerId: asId<PersonaId>("persona-chw-1"),
    dueAt: "2026-10-20T06:00:00.000Z",
    status: "assigned",
    attempts: [],
    completedAt: null,
    outcome: null,
    purpose: "planned_review",
    assignmentHistory: [],
    notes: [],
    clinicianConfirmation: { status: "not_required" },
    ...overrides,
  };
}
