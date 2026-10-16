import type {
  ClinicianConfirmationState,
  CompletionEvidenceType,
  ContactMethod,
  ContactResult,
  FollowUpOutcome,
  FollowUpPurpose,
  FollowUpStatus,
  UnableToReachReason,
} from "../enums.ts";
import type {
  ContactAttemptId,
  FacilityId,
  FollowUpId,
  PatientId,
  PersonaId,
  ReferralId,
  ReviewId,
} from "../ids.ts";
import type { IsoUtc, PersistedEntity } from "./base.ts";

export type ContactAttempt = {
  id: ContactAttemptId;
  at: IsoUtc;
  method: ContactMethod;
  result: ContactResult;
  note: string;
  durationMinutes: number | null;
  recordedBy: PersonaId;
};

export type FollowUpOutcomeRecord = {
  kind: FollowUpOutcome;
  occurredAt: IsoUtc;
  evidenceType: CompletionEvidenceType | null;
  reasonCode: UnableToReachReason | null;
  note: string;
  recordedBy: PersonaId;
};

export type FollowUpAssignment = {
  workerId: PersonaId | null;
  assignedAt: IsoUtc;
  assignedBy: PersonaId;
  reason: string | null;
};

export type FollowUpNote = {
  at: IsoUtc;
  by: PersonaId;
  text: string;
};

export type ClinicianConfirmation = {
  status: ClinicianConfirmationState;
  by?: PersonaId;
  at?: IsoUtc;
  reason?: string;
};

/** Tech spec §5.1 FollowUp + extensions. `overdue` is derived (`isFollowUpOverdue`). */
export type FollowUp = PersistedEntity & {
  id: FollowUpId;
  patientId: PatientId;
  /** Spec `referralId?` — modelled as explicit null when not linked to a referral. */
  referralId: ReferralId | null;
  // ext: originating review (repeat screening / planned review decisions).
  reviewId: ReviewId | null;
  // ext: scope.
  facilityId: FacilityId;
  assignedWorkerId: PersonaId | null;
  dueAt: IsoUtc;
  status: FollowUpStatus;
  attempts: ContactAttempt[];
  completedAt: IsoUtc | null;
  outcome: FollowUpOutcomeRecord | null;
  // ext: why the follow-up exists.
  purpose: FollowUpPurpose;
  // ext: assign / reassign trail.
  assignmentHistory: FollowUpAssignment[];
  // ext: append-only notes.
  notes: FollowUpNote[];
  // ext: WF-01 step 7 clinician confirmation (CLN-09, HWM-08).
  clinicianConfirmation: ClinicianConfirmation;
};
