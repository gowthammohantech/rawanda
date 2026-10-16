import type {
  DismissReasonCode,
  ReviewDecisionInputKind,
  ReviewOrigin,
  ReviewPriority,
  ReviewStatus,
} from "../enums.ts";
import type { FacilityId, PatientId, PersonaId, ReviewId, ScreeningId } from "../ids.ts";
import type { EvidenceSnapshot, ReasonCode } from "../rules/types.ts";
import type { IsoUtc, PersistedEntity } from "./base.ts";

export type ReviewDecision = {
  kind: ReviewDecisionInputKind;
  note: string;
  reasonCode?: DismissReasonCode;
  decidedBy: PersonaId;
  decidedAt: IsoUtc;
};

/** Tech spec §5.1 Review + extensions. */
export type Review = PersistedEntity & {
  id: ReviewId;
  screeningId: ScreeningId;
  // ext: denormalised for queue filters / scope checks.
  patientId: PatientId;
  facilityId: FacilityId;
  assignedClinicianId: PersonaId | null;
  status: ReviewStatus;
  flagReasons: ReasonCode[];
  // ext (shape): frozen FlagResult + inputs at flag time; never mutated by amendments.
  evidenceSnapshot: EvidenceSnapshot;
  // ext (shape): attributable decision (kind, note, author, time).
  decision: ReviewDecision | null;
  /** Free-text reason (dismissal reason or decision rationale). */
  decisionReason: string | null;
  reviewedAt: IsoUtc | null;
  // ext: who opened the review (`startReview` is optional — direct decision allowed).
  startedBy: PersonaId | null;
  // ext: who recorded the decision.
  reviewedBy: PersonaId | null;
  // ext: fixture-labelled urgency (no approved protocol).
  priority: ReviewPriority;
  // ext: demo fixture only — there is no approved review SLA.
  reviewDueAt: IsoUtc | null;
  // ext: ADM manual escalation vs rule flag.
  origin: ReviewOrigin;
};
