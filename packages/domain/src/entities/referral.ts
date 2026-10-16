import type {
  CompletionEvidenceType,
  ReferralCancelReasonCode,
  ReferralOutcome,
  ReferralStatus,
  ReviewPriority,
} from "../enums.ts";
import type { FacilityId, PatientId, PersonaId, ReferralId, ReviewId } from "../ids.ts";
import type { IsoUtc, PersistedEntity } from "./base.ts";

export type ReferralCompletionEvidence = {
  type: CompletionEvidenceType;
  reference: string;
  outcome: ReferralOutcome;
  note: string;
  recordedBy: PersonaId;
  recordedAt: IsoUtc;
};

export type ReferralCancellation = {
  reasonCode: ReferralCancelReasonCode;
  reason: string;
};

/** Tech spec §5.1 Referral + extensions. */
export type Referral = PersistedEntity & {
  id: ReferralId;
  patientId: PatientId;
  reviewId: ReviewId;
  /** Display label of the destination (denormalised from the destination facility). */
  destination: string;
  requestedAt: IsoUtc;
  dueAt: IsoUtc;
  status: ReferralStatus;
  completedAt: IsoUtc | null;
  // ext (shape): typed evidence with outcome and attribution.
  completionEvidence: ReferralCompletionEvidence | null;
  // ext: referring facility (scope).
  facilityId: FacilityId;
  // ext: receiving facility.
  destinationFacilityId: FacilityId;
  // ext: CHW who supports attendance.
  assignedWorkerId: PersonaId | null;
  // ext: carried from the review decision.
  priority: ReviewPriority;
  // ext: clinician's reason for referral, from the `refer` decision (CLN-07, FND-03).
  referralReason?: string;
  // ext: set on `scheduled`.
  appointmentAt: IsoUtc | null;
  // ext: set on `cancelled_with_reason`.
  cancelled: ReferralCancellation | null;
};
