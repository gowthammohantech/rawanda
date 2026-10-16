/**
 * Entity factories (FND-08 task 8): schema-valid (`@laif/contracts`) synthetic entities with
 * sequential, readable IDs (`test-patient-0001`, …). Defaults sit in facility Alpha-1 / district
 * Alpha at the pinned demo clock; pass `overrides` for anything else. Linked entities default to
 * fresh IDs — pass e.g. `{ patientId: patient.id }` to connect them.
 *
 * `resetFactorySequence()` restarts the counters (call it in `beforeEach` when IDs matter).
 */
import type { ActorContext, Scope } from "@laif/auth-demo";
import {
  asId,
  DEMO_CLOCK_DEFAULT_ISO,
  DEMO_RULE_DISCLAIMER,
  type FacilityId,
  type DistrictId,
  type FlagResult,
  type FollowUp,
  type Patient,
  type PersonaId,
  type Referral,
  type Review,
  type Role,
  type Screening,
} from "@laif/domain";

const counters = new Map<string, number>();

/** Next sequential id of `kind`: `test-<kind>-0001`, `test-<kind>-0002`, … */
export function nextTestId(kind: string): string {
  const n = (counters.get(kind) ?? 0) + 1;
  counters.set(kind, n);
  return `test-${kind}-${String(n).padStart(4, "0")}`;
}

/** Restarts every factory counter. */
export function resetFactorySequence(): void {
  counters.clear();
}

export const TEST_FACILITY_ID = asId<FacilityId>("fac-alpha-1");
export const TEST_DESTINATION_FACILITY_ID = asId<FacilityId>("fac-alpha-2");
export const TEST_DISTRICT_ID = asId<DistrictId>("dist-alpha");
export const TEST_WORKER_ID = asId<PersonaId>("persona-chw-alpha1-a");
export const TEST_CLINICIAN_ID = asId<PersonaId>("persona-clin-alpha1");
export const TEST_RULESET_VERSION = "demo-ruleset-2026.10-v1";

const NOW = DEMO_CLOCK_DEFAULT_ISO;

const persisted = (at = NOW) => ({
  version: 1,
  createdAt: at,
  updatedAt: at,
  synthetic: true as const,
});

export function buildPatient(overrides: Partial<Patient> = {}): Patient {
  const id = nextTestId("patient");
  const n = id.slice(-4);
  return {
    ...persisted(),
    id: asId(id),
    syntheticIdentifier: `DEMO-T-${n}`,
    displayName: `Test Patient ${n}`,
    dateOfBirth: "1970-01-01",
    sexOptional: null,
    facilityId: TEST_FACILITY_ID,
    districtId: TEST_DISTRICT_ID,
    consentState: "granted",
    identityStatus: "verified_local",
    duplicateCandidateIds: [],
    preferredLanguage: "en",
    ...overrides,
  };
}

/** A flag result for a systolic reading at or above the illustrative demo threshold. */
export function buildFlag(overrides: Partial<FlagResult> = {}): FlagResult {
  return {
    requiresReview: true,
    evaluable: true,
    reasonCodes: ["DEMO_BP_SYSTOLIC_AT_OR_ABOVE_THRESHOLD"],
    triggeringObservations: [{ code: "SYSTOLIC", value: 150, unit: "mmHg", comparedTo: 145 }],
    rulesetVersion: TEST_RULESET_VERSION,
    displayDisclaimer: DEMO_RULE_DISCLAIMER,
    ...overrides,
  };
}

/** Defaults to a submitted, flagged screening (`review_required`). */
export function buildScreening(overrides: Partial<Screening> = {}): Screening {
  const id = nextTestId("screening");
  return {
    ...persisted(),
    id: asId(id),
    patientId: asId(nextTestId("patient")),
    workerId: TEST_WORKER_ID,
    facilityId: TEST_FACILITY_ID,
    districtId: TEST_DISTRICT_ID,
    measuredAt: NOW,
    systolic: 150,
    diastolic: 90,
    glucoseValue: null,
    glucoseUnit: null,
    glucoseContext: null,
    observations: [],
    source: "worker_mobile",
    rulesetVersion: TEST_RULESET_VERSION,
    status: "review_required",
    flag: buildFlag(),
    clientMutationId: `${id}-cm`,
    captureDurationSeconds: 120,
    notes: "",
    amendments: [],
    ...overrides,
  };
}

/** Defaults to a pending rule-flag review. */
export function buildReview(overrides: Partial<Review> = {}): Review {
  const flag = buildFlag();
  return {
    ...persisted(),
    id: asId(nextTestId("review")),
    screeningId: asId(nextTestId("screening")),
    patientId: asId(nextTestId("patient")),
    facilityId: TEST_FACILITY_ID,
    assignedClinicianId: null,
    status: "pending",
    flagReasons: [...flag.reasonCodes],
    evidenceSnapshot: {
      flag,
      inputs: {
        systolic: 150,
        diastolic: 90,
        glucoseValue: null,
        glucoseUnit: null,
        glucoseContext: null,
      },
      capturedAt: NOW,
      capturedBy: TEST_WORKER_ID,
    },
    decision: null,
    decisionReason: null,
    reviewedAt: null,
    startedBy: null,
    reviewedBy: null,
    priority: "routine",
    reviewDueAt: null,
    origin: "rule_flag",
    ...overrides,
  };
}

/** Defaults to a `created` referral from Alpha-1 to Alpha-2, due in seven days. */
export function buildReferral(overrides: Partial<Referral> = {}): Referral {
  return {
    ...persisted(),
    id: asId(nextTestId("referral")),
    patientId: asId(nextTestId("patient")),
    reviewId: asId(nextTestId("review")),
    destination: "Demo Health Centre Alpha-2",
    requestedAt: NOW,
    dueAt: "2026-10-21T06:00:00.000Z",
    status: "created",
    completedAt: null,
    completionEvidence: null,
    facilityId: TEST_FACILITY_ID,
    destinationFacilityId: TEST_DESTINATION_FACILITY_ID,
    assignedWorkerId: TEST_WORKER_ID,
    priority: "routine",
    appointmentAt: null,
    cancelled: null,
    ...overrides,
  };
}

/** Defaults to an `assigned` referral-attendance follow-up for the Alpha-1 CHW. */
export function buildFollowUp(overrides: Partial<FollowUp> = {}): FollowUp {
  return {
    ...persisted(),
    id: asId(nextTestId("followup")),
    patientId: asId(nextTestId("patient")),
    referralId: null,
    reviewId: null,
    facilityId: TEST_FACILITY_ID,
    assignedWorkerId: TEST_WORKER_ID,
    dueAt: "2026-10-18T06:00:00.000Z",
    status: "assigned",
    attempts: [],
    completedAt: null,
    outcome: null,
    purpose: "referral_attendance",
    assignmentHistory: [
      { workerId: TEST_WORKER_ID, assignedAt: NOW, assignedBy: TEST_CLINICIAN_ID, reason: null },
    ],
    notes: [],
    clinicianConfirmation: { status: "not_required" },
    ...overrides,
  };
}

const PROGRAMME_ROLES: readonly Role[] = ["programme_lead", "auditor"];
const DISTRICT_ROLES: readonly Role[] = ["district_analyst", "field_supervisor"];

/** The scope a role usually has in the demo (Alpha-1 / district Alpha / programme / self). */
export function defaultScopeFor(role: Role): Scope {
  if (role === "citizen") return { kind: "self", patientIds: [asId(nextTestId("patient"))] };
  if (PROGRAMME_ROLES.includes(role)) return { kind: "programme" };
  if (DISTRICT_ROLES.includes(role)) return { kind: "district", districtIds: [TEST_DISTRICT_ID] };
  return { kind: "facility", facilityIds: [TEST_FACILITY_ID] };
}

/** An `ActorContext` for `role` with `scope` (default: `defaultScopeFor(role)`). */
export function buildActor(
  role: Role,
  scope: Scope = defaultScopeFor(role),
  overrides: Partial<ActorContext> = {},
): ActorContext {
  return {
    personaId: asId(nextTestId(`persona-${role}`)),
    role,
    scope,
    ...overrides,
  };
}
