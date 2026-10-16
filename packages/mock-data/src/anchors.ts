/**
 * SEED_ANCHORS (FND-05 task 5a): stable record IDs that app phases and E2E specs reference
 * instead of building their own seeds (replaces CLN-02 `buildClinicalSeed` / `CLINICAL_SCENARIO_IDS`
 * and CTZ-01 `citizenScenarioSeed`). Each entry's documented state is asserted in anchors.test.ts.
 */
import type {
  CareInstructionId,
  FacilityId,
  FollowUpId,
  PatientId,
  PersonaId,
  ReferralId,
  ReviewId,
  ScreeningId,
} from "@laif/domain";

import { ID_NAMESPACES, seedId } from "./ids.ts";
import { FACILITY_IDS } from "./reference/facilities.ts";
import { PERSONA_IDS } from "./reference/personas.ts";
import { PATIENT_INDEX, patientId } from "./seed/ids.ts";
import {
  CARE_INSTRUCTION_NO,
  FOLLOW_UP_NO,
  PATHWAY,
  REFERRAL_NO,
  SCREENING_NO,
} from "./seed/plan.ts";

const screening = (n: number) => seedId<ScreeningId>(ID_NAMESPACES.screening, n);
const review = (n: number) => seedId<ReviewId>(ID_NAMESPACES.review, n);
const referral = (n: number) => seedId<ReferralId>(ID_NAMESPACES.referral, n);
const followUp = (n: number) => seedId<FollowUpId>(ID_NAMESPACES.followUp, n);
const instruction = (n: number) => seedId<CareInstructionId>(ID_NAMESPACES.careInstruction, n);

export type SeedAnchor = {
  /** What the anchor guarantees (documentation; asserted by tests). */
  readonly state: string;
  readonly patientId?: PatientId;
  readonly patientIds?: readonly PatientId[];
  readonly screeningId?: ScreeningId;
  readonly reviewId?: ReviewId;
  readonly referralId?: ReferralId;
  readonly followUpId?: FollowUpId;
  readonly careInstructionId?: CareInstructionId;
  readonly personaId?: PersonaId;
  readonly facilityId?: FacilityId;
};

export const SEED_ANCHORS = {
  WF01_FLAGGED_REVIEW: {
    state:
      "Alpha-1 review `pending`, assigned to persona-clin-alpha1; BP + glucose with units (= SCN-02)",
    patientId: patientId(PATIENT_INDEX.wf01Flagged),
    screeningId: screening(PATHWAY.wf01Flagged),
    reviewId: review(PATHWAY.wf01Flagged),
    personaId: PERSONA_IDS.clinAlpha1,
    facilityId: FACILITY_IDS.alpha1,
  },
  WF01_WORKER_COMPLETED_FU: {
    state: "follow-up `completed` by a worker with clinicianConfirmation `pending` (Alpha-1)",
    patientId: patientId(PATIENT_INDEX.workerCompleted),
    reviewId: review(PATHWAY.workerCompleted),
    referralId: referral(REFERRAL_NO.R8),
    followUpId: followUp(FOLLOW_UP_NO.FA8),
    personaId: PERSONA_IDS.chwAlpha1B,
    facilityId: FACILITY_IDS.alpha1,
  },
  WF02_FOLLOWUP_CONFLICT: {
    state:
      "open follow-up (`contacted`) at version 3, assigned to persona-chw-alpha1-a (web simulateExternalUpdate / worker SCN-09)",
    patientId: patientId(PATIENT_INDEX.ctzP1),
    referralId: referral(REFERRAL_NO.R6),
    followUpId: followUp(FOLLOW_UP_NO.FA6),
    personaId: PERSONA_IDS.chwAlpha1A,
    facilityId: FACILITY_IDS.alpha1,
  },
  WF03_DISMISSABLE_FLAG: {
    state: "Alpha-1 review `pending` whose screening evidence includes a repeat reading",
    patientId: patientId(PATIENT_INDEX.wf03Dismissable),
    screeningId: screening(PATHWAY.wf03Dismissable),
    reviewId: review(PATHWAY.wf03Dismissable),
    personaId: PERSONA_IDS.clinAlpha1,
    facilityId: FACILITY_IDS.alpha1,
  },
  WF04_OTHER_FACILITY_PATIENT: {
    state: "Beta-1 patient with a `pending` review (out of scope for Alpha personas)",
    patientId: patientId(PATIENT_INDEX.wf04OtherFacility),
    screeningId: screening(PATHWAY.wf04OtherFacility),
    reviewId: review(PATHWAY.wf04OtherFacility),
    personaId: PERSONA_IDS.clinBeta1,
    facilityId: FACILITY_IDS.beta1,
  },
  MISSING_UNIT_SCREENING: {
    state:
      "imported screening with glucoseUnit null, flag GLUCOSE_UNIT_MISSING, review `in_review` (= SCN-06)",
    patientId: patientId(PATIENT_INDEX.missingUnit),
    screeningId: screening(PATHWAY.missingUnit),
    reviewId: review(PATHWAY.missingUnit),
    facilityId: FACILITY_IDS.alpha2,
  },
  MISSING_UNIT_DRAFT: {
    state: "worker draft (persona-chw-alpha1-a) with a glucose value but no unit (SCN-06)",
    patientId: patientId(9),
    screeningId: screening(SCREENING_NO.draftMissingUnit),
    personaId: PERSONA_IDS.chwAlpha1A,
    facilityId: FACILITY_IDS.alpha1,
  },
  DUPLICATE_IDENTITY_PAIR: {
    state: "two Beta-1 patients with identityStatus `possible_duplicate` referencing each other",
    patientIds: [patientId(PATIENT_INDEX.duplicateA), patientId(PATIENT_INDEX.duplicateB)],
    facilityId: FACILITY_IDS.beta1,
  },
  AMENDED_SCREENING: {
    state:
      "submitted screening with exactly one amendment (systolic), original fields retained, version 4",
    patientId: patientId(PATIENT_INDEX.amended),
    screeningId: screening(SCREENING_NO.amended),
    facilityId: FACILITY_IDS.alpha2,
  },
  OVERDUE_REFERRAL: {
    state: "referral `scheduled` with dueAt before the demo clock (= SCN-04)",
    patientId: patientId(PATIENT_INDEX.overdueReferral),
    reviewId: review(PATHWAY.overdueReferral),
    referralId: referral(REFERRAL_NO.R5),
    facilityId: FACILITY_IDS.alpha1,
  },
  CANCELLED_REFERRAL: {
    state:
      "referral `cancelled_with_reason`, followed by a replacement referral on the same review",
    patientId: patientId(PATIENT_INDEX.ctzP2),
    reviewId: review(PATHWAY.ctzP2Cancelled),
    referralId: referral(REFERRAL_NO.R12),
    facilityId: FACILITY_IDS.alpha2,
  },
  REPLACEMENT_REFERRAL: {
    state: "replacement referral (`scheduled`) on the same review as CANCELLED_REFERRAL",
    patientId: patientId(PATIENT_INDEX.ctzP2),
    reviewId: review(PATHWAY.ctzP2Cancelled),
    referralId: referral(REFERRAL_NO.R7),
    facilityId: FACILITY_IDS.alpha2,
  },
  COMPLETED_REFERRAL_WITH_EVIDENCE: {
    state: "referral `completed` with typed completion evidence (Beta-1)",
    patientId: patientId(PATIENT_INDEX.completedReferralBeta),
    reviewId: review(PATHWAY.completedBeta),
    referralId: referral(REFERRAL_NO.R10),
    facilityId: FACILITY_IDS.beta1,
  },
  OVERDUE_FOLLOWUP: {
    state: "follow-up `assigned` with dueAt before the demo clock",
    patientId: patientId(PATIENT_INDEX.overdueReferral),
    referralId: referral(REFERRAL_NO.R5),
    followUpId: followUp(FOLLOW_UP_NO.FA5),
    personaId: PERSONA_IDS.chwAlpha1A,
    facilityId: FACILITY_IDS.alpha1,
  },
  UNABLE_TO_REACH_FOLLOWUP: {
    state: "follow-up `unable_to_reach` after two not-reached attempts (Alpha-2)",
    patientId: patientId(PATIENT_INDEX.unableToReach),
    referralId: referral(REFERRAL_NO.R11),
    followUpId: followUp(FOLLOW_UP_NO.PC4),
    personaId: PERSONA_IDS.chwAlpha2A,
    facilityId: FACILITY_IDS.alpha2,
  },
  COMPLETED_FOLLOWUP_WITH_INSTRUCTION: {
    state:
      "follow-up `completed` with evidence, confirmed, with a released care instruction (= SCN-05, CTZ-P1)",
    patientId: patientId(PATIENT_INDEX.ctzP1),
    referralId: referral(REFERRAL_NO.R9),
    followUpId: followUp(FOLLOW_UP_NO.FA9),
    careInstructionId: instruction(CARE_INSTRUCTION_NO.CI1),
    personaId: PERSONA_IDS.citizen1,
    facilityId: FACILITY_IDS.alpha1,
  },
  CTZ_P1_UNRELEASED_REFERRAL: {
    state:
      "CTZ-P1 referral `created` with NO released care instruction — must never reach the wallet",
    patientId: patientId(PATIENT_INDEX.ctzP1),
    reviewId: review(PATHWAY.ctzP1Unreleased),
    referralId: referral(REFERRAL_NO.R1),
    personaId: PERSONA_IDS.citizen1,
    facilityId: FACILITY_IDS.alpha1,
  },
  CTZ_P1_APPOINTMENT_INSTRUCTION: {
    state: "CTZ-P1 released appointment instruction for 19 Oct 10:30 Kigali (referral `scheduled`)",
    patientId: patientId(PATIENT_INDEX.ctzP1),
    referralId: referral(REFERRAL_NO.R6),
    careInstructionId: instruction(CARE_INSTRUCTION_NO.CI2),
    personaId: PERSONA_IDS.citizen1,
    facilityId: FACILITY_IDS.alpha1,
  },
  CTZ_P2_DISMISSED_SCREENING: {
    state: "CTZ-P2 screening whose review is `dismissed_with_reason`",
    patientId: patientId(PATIENT_INDEX.ctzP2),
    screeningId: screening(PATHWAY.ctzP2Dismissed),
    reviewId: review(PATHWAY.ctzP2Dismissed),
    personaId: PERSONA_IDS.citizen2,
    facilityId: FACILITY_IDS.alpha2,
  },
  CTZ_P2_AWAITING_REVIEW_SCREENING: {
    state: "CTZ-P2 newest screening, review `pending` (value-less placeholder in the wallet)",
    patientId: patientId(PATIENT_INDEX.ctzP2),
    screeningId: screening(PATHWAY.ctzP2Awaiting),
    reviewId: review(PATHWAY.ctzP2Awaiting),
    personaId: PERSONA_IDS.citizen2,
    facilityId: FACILITY_IDS.alpha2,
  },
  CTZ_P2_WITHDRAWN_INSTRUCTION: {
    state: "CTZ-P2 care instruction `withdrawn` (its referral was cancelled)",
    patientId: patientId(PATIENT_INDEX.ctzP2),
    referralId: referral(REFERRAL_NO.R12),
    careInstructionId: instruction(CARE_INSTRUCTION_NO.CI7),
    personaId: PERSONA_IDS.citizen2,
    facilityId: FACILITY_IDS.alpha2,
  },
  CTZ_P3_WITHDRAWN_PATIENT: {
    state:
      "CTZ-P3 patient with consentState `withdrawn`; reminders cancelled `consent_withdrawn` (= SCN-10)",
    patientId: patientId(PATIENT_INDEX.ctzP3Withdrawn),
    personaId: PERSONA_IDS.citizenWithdrawn,
    facilityId: FACILITY_IDS.alpha1,
  },
  CTZ_P4_REPRESENTED_PATIENT: {
    state:
      "patient represented by CTZ-P4: released no-action result + released planned-review follow-up",
    patientId: patientId(PATIENT_INDEX.ctzP4Represented),
    screeningId: screening(SCREENING_NO.ctzP4NoAction),
    reviewId: review(PATHWAY.ctzP4PlanFollowUp),
    followUpId: followUp(FOLLOW_UP_NO.PR1),
    careInstructionId: instruction(CARE_INSTRUCTION_NO.CI5),
    personaId: PERSONA_IDS.citizenRep,
    facilityId: FACILITY_IDS.alpha2,
  },
  SCN01_NORMAL_SCREENING: {
    state: "submitted screening `no_review_required` by persona-chw-alpha1-a (= SCN-01)",
    patientId: patientId(PATIENT_INDEX.scn01Normal),
    screeningId: screening(SCREENING_NO.scn01Normal),
    personaId: PERSONA_IDS.chwAlpha1A,
    facilityId: FACILITY_IDS.alpha1,
  },
  SCN03_DISMISSED_REVIEW: {
    state: "review `dismissed_with_reason` by persona-clin-alpha1, no referral (= SCN-03)",
    patientId: patientId(PATIENT_INDEX.scn03Dismissed),
    screeningId: screening(PATHWAY.scn03Dismissed),
    reviewId: review(PATHWAY.scn03Dismissed),
    personaId: PERSONA_IDS.clinAlpha1,
    facilityId: FACILITY_IDS.alpha1,
  },
} as const satisfies Record<string, SeedAnchor>;

export type SeedAnchorName = keyof typeof SEED_ANCHORS;
