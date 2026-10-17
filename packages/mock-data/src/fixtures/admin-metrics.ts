/**
 * `adminMetricsFixture` (ADM-02 tests) — a tiny hand-computed calculator fixture.
 * SYNTHETIC DEMONSTRATION DATA — NOT FOR CLINICAL USE. Re-exported by `@laif/test-utils`.
 *
 * Period 2026-10-01 … 2026-10-14 (Kigali), now = 2026-10-14T06:00Z. Expected values:
 * - 10 submitted screenings (8 Alpha-1, 2 Alpha-2), 10 people; types: 6 BP only, 2 glucose only,
 *   2 both (bp filter = 8, glucose filter = 4);
 * - 6 flagged (s1–s4 BP, s7 glucose, s9 both);
 * - 5 reviewed (s1, s2, s3, s7 actioned; s4 dismissed with reason); s9 pending (age 10 days → 8+);
 * - review delays [0.5, 1, 1.5, 2, 4] days → median 1.5;
 * - 3 referred (s1, s2, s3), 2 follow-up completed (s1 referral with evidence, s2 follow-up with
 *   outcome); s3's referral is past its `dueAt` → 1 overdue referral;
 * - excluded: s11 (patient withdrew consent; flagged, reviewed, completed) and s12 (a draft).
 */
import {
  asId,
  DEMO_RULE_DISCLAIMER,
  type FlagResult,
  type FollowUp,
  type Patient,
  type Referral,
  type Review,
  type Screening,
} from "@laif/domain";

import { buildDistricts, DISTRICT_IDS } from "../reference/districts.ts";
import { buildFacilities, FACILITY_IDS } from "../reference/facilities.ts";
import { PERSONA_IDS } from "../reference/personas.ts";

const NOW = "2026-10-14T06:00:00.000Z";
const DAY_MS = 86_400_000;
const RULESET = "demo-ruleset-2026.10-v1";

export const ADMIN_METRICS_FIXTURE_NOW = NOW;
export const ADMIN_METRICS_FIXTURE_PERIOD = { from: "2026-10-01", to: "2026-10-14" } as const;

const persisted = { version: 1, createdAt: NOW, updatedAt: NOW, synthetic: true as const };
const plusDays = (iso: string, days: number): string =>
  new Date(Date.parse(iso) + days * DAY_MS).toISOString();

function flag(requiresReview: boolean): FlagResult {
  return {
    requiresReview,
    evaluable: true,
    reasonCodes: requiresReview ? ["DEMO_BP_SYSTOLIC_AT_OR_ABOVE_THRESHOLD"] : [],
    triggeringObservations: [],
    rulesetVersion: RULESET,
    displayDisclaimer: DEMO_RULE_DISCLAIMER,
  };
}

type Spec = {
  n: number;
  facility: "alpha1" | "alpha2";
  measuredAt: string;
  bp: boolean;
  glucose: boolean;
  flagged: boolean;
  patient?: string;
  draft?: boolean;
};

const SPECS: Spec[] = [
  {
    n: 1,
    facility: "alpha1",
    measuredAt: "2026-10-02T07:00:00.000Z",
    bp: true,
    glucose: false,
    flagged: true,
  },
  {
    n: 2,
    facility: "alpha1",
    measuredAt: "2026-10-03T07:00:00.000Z",
    bp: true,
    glucose: false,
    flagged: true,
  },
  {
    n: 3,
    facility: "alpha1",
    measuredAt: "2026-10-05T07:00:00.000Z",
    bp: true,
    glucose: false,
    flagged: true,
  },
  {
    n: 4,
    facility: "alpha1",
    measuredAt: "2026-10-06T07:00:00.000Z",
    bp: true,
    glucose: false,
    flagged: true,
  },
  {
    n: 5,
    facility: "alpha1",
    measuredAt: "2026-10-07T07:00:00.000Z",
    bp: true,
    glucose: false,
    flagged: false,
  },
  {
    n: 6,
    facility: "alpha1",
    measuredAt: "2026-10-08T07:00:00.000Z",
    bp: true,
    glucose: false,
    flagged: false,
  },
  {
    n: 7,
    facility: "alpha1",
    measuredAt: "2026-10-08T09:00:00.000Z",
    bp: false,
    glucose: true,
    flagged: true,
  },
  {
    n: 8,
    facility: "alpha1",
    measuredAt: "2026-10-09T07:00:00.000Z",
    bp: false,
    glucose: true,
    flagged: false,
  },
  {
    n: 9,
    facility: "alpha2",
    measuredAt: "2026-10-04T06:00:00.000Z",
    bp: true,
    glucose: true,
    flagged: true,
  },
  {
    n: 10,
    facility: "alpha2",
    measuredAt: "2026-10-10T07:00:00.000Z",
    bp: true,
    glucose: true,
    flagged: false,
  },
  // Excluded: consent withdrawn (s11) and a draft (s12, patient 1).
  {
    n: 11,
    facility: "alpha1",
    measuredAt: "2026-10-04T07:00:00.000Z",
    bp: true,
    glucose: false,
    flagged: true,
    patient: "fx-patient-withdrawn",
  },
  {
    n: 12,
    facility: "alpha1",
    measuredAt: "2026-10-11T07:00:00.000Z",
    bp: true,
    glucose: false,
    flagged: false,
    patient: "fx-patient-01",
    draft: true,
  },
];

const pid = (spec: Spec): string => spec.patient ?? `fx-patient-${String(spec.n).padStart(2, "0")}`;

function patient(id: string, facility: "alpha1" | "alpha2", withdrawn = false): Patient {
  return {
    ...persisted,
    id: asId(id),
    syntheticIdentifier: `DEMO-FX-${id.slice(-2)}`,
    displayName: `Fixture Person ${id.slice(-2)}`,
    dateOfBirth: "1970-01-01",
    sexOptional: null,
    facilityId: FACILITY_IDS[facility],
    districtId: DISTRICT_IDS.alpha,
    consentState: withdrawn ? "withdrawn" : "granted",
    identityStatus: "verified_local",
    duplicateCandidateIds: [],
    preferredLanguage: "en",
  };
}

function screening(spec: Spec): Screening {
  return {
    ...persisted,
    id: asId(`fx-screening-${String(spec.n).padStart(2, "0")}`),
    patientId: asId(pid(spec)),
    workerId: PERSONA_IDS.chwAlpha1A,
    facilityId: FACILITY_IDS[spec.facility],
    districtId: DISTRICT_IDS.alpha,
    measuredAt: spec.measuredAt,
    systolic: spec.bp ? (spec.flagged ? 160 : 120) : null,
    diastolic: spec.bp ? 80 : null,
    glucoseValue: spec.glucose ? 6.2 : null,
    glucoseUnit: spec.glucose ? "mmol/L" : null,
    glucoseContext: spec.glucose ? "fasting" : null,
    observations: [],
    source: "worker_mobile",
    rulesetVersion: spec.draft === true ? null : RULESET,
    status: spec.draft === true ? "draft" : spec.flagged ? "review_required" : "no_review_required",
    flag: spec.draft === true ? null : flag(spec.flagged),
    clientMutationId: `fx-cm-${spec.n}`,
    captureDurationSeconds: 120,
    notes: "",
    amendments: [],
  };
}

function review(
  s: Screening,
  status: Review["status"],
  delayDays: number | null,
  n: number,
): Review {
  const reviewedAt = delayDays === null ? null : plusDays(s.measuredAt, delayDays);
  const dismissed = status === "dismissed_with_reason";
  return {
    ...persisted,
    id: asId(`fx-review-${String(n).padStart(2, "0")}`),
    screeningId: s.id,
    patientId: s.patientId,
    facilityId: s.facilityId,
    assignedClinicianId: null,
    status,
    flagReasons: ["DEMO_BP_SYSTOLIC_AT_OR_ABOVE_THRESHOLD"],
    evidenceSnapshot: {
      flag: flag(true),
      inputs: {
        systolic: s.systolic,
        diastolic: s.diastolic,
        glucoseValue: s.glucoseValue,
        glucoseUnit: s.glucoseUnit,
        glucoseContext: s.glucoseContext,
      },
      capturedAt: s.measuredAt,
      capturedBy: s.workerId,
    },
    decision:
      reviewedAt === null
        ? null
        : {
            kind: dismissed ? "dismiss" : "refer",
            note: "Fixture decision",
            ...(dismissed ? { reasonCode: "repeat_reading_acceptable" as const } : {}),
            decidedBy: PERSONA_IDS.clinAlpha1,
            decidedAt: reviewedAt,
          },
    decisionReason: dismissed ? "Repeat reading acceptable (fixture)" : null,
    reviewedAt,
    startedBy: null,
    reviewedBy: reviewedAt === null ? null : PERSONA_IDS.clinAlpha1,
    priority: "routine",
    reviewDueAt: null,
    origin: "rule_flag",
  };
}

function referral(r: Review, n: number, completed: boolean, dueAt: string): Referral {
  const completedAt = completed ? plusDays(r.reviewedAt ?? NOW, 2) : null;
  return {
    ...persisted,
    id: asId(`fx-referral-${String(n).padStart(2, "0")}`),
    patientId: r.patientId,
    reviewId: r.id,
    destination: "Demo Health Centre Alpha-2",
    requestedAt: r.reviewedAt ?? NOW,
    dueAt,
    status: completed ? "completed" : "created",
    completedAt,
    completionEvidence:
      completedAt === null
        ? null
        : {
            type: "facility_attendance_record",
            reference: `FX-REF-${n}`,
            outcome: "attended_seen",
            note: "",
            recordedBy: PERSONA_IDS.clinAlpha1,
            recordedAt: completedAt,
          },
    facilityId: r.facilityId,
    destinationFacilityId: FACILITY_IDS.alpha2,
    assignedWorkerId: PERSONA_IDS.chwAlpha1A,
    priority: "routine",
    appointmentAt: null,
    cancelled: null,
  };
}

function followUp(ref: Referral, n: number): FollowUp {
  const completedAt = plusDays(ref.requestedAt, 3);
  return {
    ...persisted,
    id: asId(`fx-followup-${String(n).padStart(2, "0")}`),
    patientId: ref.patientId,
    referralId: ref.id,
    reviewId: null,
    facilityId: ref.facilityId,
    assignedWorkerId: PERSONA_IDS.chwAlpha1A,
    dueAt: plusDays(ref.requestedAt, 7),
    status: "completed",
    attempts: [],
    completedAt,
    outcome: {
      kind: "attended",
      occurredAt: completedAt,
      evidenceType: "worker_accompanied_visit",
      reasonCode: null,
      note: "",
      recordedBy: PERSONA_IDS.chwAlpha1A,
    },
    purpose: "referral_attendance",
    assignmentHistory: [],
    notes: [],
    clinicianConfirmation: { status: "not_required" },
  };
}

export type AdminMetricsFixture = {
  patients: Patient[];
  screenings: Screening[];
  reviews: Review[];
  referrals: Referral[];
  followUps: FollowUp[];
  facilities: ReturnType<typeof buildFacilities>;
  districts: ReturnType<typeof buildDistricts>;
  timeEntries: [];
};

/** Fresh copy of the fixture (records are plain objects; safe to mutate per test). */
export function adminMetricsFixture(): AdminMetricsFixture {
  const screenings = SPECS.map(screening);
  const byN = (n: number): Screening => screenings[n - 1] as Screening;
  const patients = [
    ...SPECS.filter((s) => s.patient === undefined).map((s) => patient(pid(s), s.facility)),
    patient("fx-patient-withdrawn", "alpha1", true),
  ];
  const reviews = [
    review(byN(1), "action_recorded", 0.5, 1),
    review(byN(2), "action_recorded", 1, 2),
    review(byN(3), "action_recorded", 1.5, 3),
    review(byN(4), "dismissed_with_reason", 2, 4),
    review(byN(7), "action_recorded", 4, 7),
    review(byN(9), "pending", null, 9),
    review(byN(11), "action_recorded", 1, 11),
  ];
  const rv = (n: number): Review =>
    reviews.find((r) => r.id === `fx-review-${String(n).padStart(2, "0")}`) as Review;
  const referrals = [
    referral(rv(1), 1, true, "2026-10-20T06:00:00.000Z"),
    referral(rv(2), 2, false, "2026-10-20T06:00:00.000Z"),
    // Past due (explicit dueAt before now) and incomplete → 1 overdue referral.
    referral(rv(3), 3, false, "2026-10-10T06:00:00.000Z"),
    referral(rv(11), 11, true, "2026-10-20T06:00:00.000Z"),
  ];
  const followUps = [followUp(referrals[1] as Referral, 2)];
  return {
    patients,
    screenings,
    reviews,
    referrals,
    followUps,
    facilities: buildFacilities(NOW),
    districts: buildDistricts(NOW),
    timeEntries: [],
  };
}
