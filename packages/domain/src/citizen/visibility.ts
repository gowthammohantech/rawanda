/**
 * Citizen wallet visibility rules (CTZ-01) — the safety core of the wallet. Pure functions over
 * the clinician-side records already on the device; the repository exposes ONLY their output.
 *
 * - A screening is citizen-visible only once a clinician has released it (review decided or
 *   dismissed; a `no_review_required` submission counts as released with no action). Screenings
 *   still awaiting review become a value-less `PendingReviewPlaceholder` — no readings, no flag,
 *   no reason codes ever leave this module for them. Drafts are never visible.
 * - A dismissed flag is projected as "reviewed, no action needed" — never as a finding; the
 *   original flag reasons / dismiss reason codes are not part of the projection.
 * - A next step is visible only when the care team approved it (FND `CareInstruction.status:
 *   'released'`); withdrawn instructions and unreleased referrals are unreachable.
 * - "Date has passed" is a boolean notice (`deriveDatePassed`), never "overdue".
 */
import { deriveDatePassed, deriveInstructionProgress, effectiveReadings } from "../derive.ts";
import type {
  AmendableScreeningField,
  CompletionEvidenceType,
  GlucoseContext,
  GlucoseUnit,
  InstructionProgress,
} from "../enums.ts";
import type { CareInstruction } from "../entities/care-instruction.ts";
import type { FollowUp } from "../entities/follow-up.ts";
import type { Referral } from "../entities/referral.ts";
import type { Review } from "../entities/review.ts";
import type { AmendableValue, Screening } from "../entities/screening.ts";
import type { FacilityId, PatientId, PersonaId, ReviewId, ScreeningId } from "../ids.ts";
import type { IsoUtc } from "../entities/base.ts";

/** Review state of a screening as the wallet sees it (`ctz_released_observations.review_state`). */
export const CITIZEN_REVIEW_STATES = [
  "released_follow_up",
  "released_no_action",
  "dismissed_with_reason",
  "awaiting_review",
] as const;
export type CitizenReviewState = (typeof CITIZEN_REVIEW_STATES)[number];
export type ReleasedReviewState = Exclude<CitizenReviewState, "awaiting_review">;

/** Plain-language result labels (`citizen:health.chip.*`); never the original flag reason. */
export const CITIZEN_RESULT_LABELS = [
  "followUpAgreed",
  "noActionNeeded",
  "reviewedNoActionNeeded",
] as const;
export type CitizenResultLabel = (typeof CITIZEN_RESULT_LABELS)[number];

/** Blood pressure is always recorded in mmHg (explicit unit, FRD §6). */
export const BLOOD_PRESSURE_UNIT = "mmHg" as const;

export type CitizenReadings = {
  systolic: number | null;
  diastolic: number | null;
  /** `mmHg` when a blood pressure value is present, else null. */
  bloodPressureUnit: typeof BLOOD_PRESSURE_UNIT | null;
  glucoseValue: number | null;
  glucoseUnit: GlucoseUnit | null;
  glucoseContext: GlucoseContext | null;
};

/** One amendment as the citizen sees it: original and updated value, who and when. */
export type CitizenAmendment = {
  field: AmendableScreeningField;
  before: AmendableValue;
  after: AmendableValue;
  amendedBy: PersonaId;
  amendedAt: IsoUtc;
  /** Only when the stored reason is an i18n-able key (`snake_case`); free text never leaves. */
  reasonKey: string | null;
};

/** A released result (logical `ctz_released_observations` row — derived, never stored). */
export type ReleasedObservation = {
  kind: "released";
  /** = the screening id. */
  id: ScreeningId;
  patientId: PatientId;
  screeningId: ScreeningId;
  reviewId: ReviewId | null;
  reviewState: ReleasedReviewState;
  label: CitizenResultLabel;
  measuredAt: IsoUtc;
  facilityId: FacilityId;
  /** Current values (amendments applied). */
  readings: CitizenReadings;
  /** Values as first recorded — only when the record was amended (original retained). */
  originalReadings: CitizenReadings | null;
  amendments: CitizenAmendment[];
  /** Responsible professional; null for `no_review_required` submissions. */
  reviewedBy: PersonaId | null;
  reviewedAt: IsoUtc | null;
};

/** A recent check still waiting for the care team: NO values, flags or reason codes. */
export type PendingReviewPlaceholder = {
  kind: "pending_review";
  id: ScreeningId;
  patientId: PatientId;
  measuredAt: IsoUtc;
};

export type CitizenObservationItem = ReleasedObservation | PendingReviewPlaceholder;

type ScreeningLike = Pick<
  Screening,
  | "id"
  | "patientId"
  | "facilityId"
  | "status"
  | "measuredAt"
  | "systolic"
  | "diastolic"
  | "glucoseValue"
  | "glucoseUnit"
  | "glucoseContext"
  | "amendments"
>;
type ReviewLike = Pick<
  Review,
  "id" | "screeningId" | "status" | "decision" | "reviewedAt" | "reviewedBy" | "updatedAt"
>;

/**
 * Wallet review state of a screening (`null` = never visible, e.g. a draft).
 * - review `pending` / `in_review`, or flagged without a review yet → `awaiting_review`
 * - review `dismissed_with_reason` → `dismissed_with_reason`
 * - review `action_recorded`: `no_further_action` → `released_no_action`, any other action
 *   (refer, plan follow-up, repeat screening) → `released_follow_up`
 * - no review and `no_review_required` → `released_no_action`
 */
export function deriveCitizenReviewState(
  screening: Pick<Screening, "status">,
  review: Pick<Review, "status" | "decision"> | null,
): CitizenReviewState | null {
  if (screening.status === "draft") return null;
  if (review === null) {
    return screening.status === "no_review_required" ? "released_no_action" : "awaiting_review";
  }
  switch (review.status) {
    case "pending":
    case "in_review":
      return "awaiting_review";
    case "dismissed_with_reason":
      return "dismissed_with_reason";
    case "action_recorded":
      return review.decision?.kind === "no_further_action"
        ? "released_no_action"
        : "released_follow_up";
  }
}

/** `released_follow_up → followUpAgreed`, `released_no_action → noActionNeeded`,
 * `dismissed_with_reason → reviewedNoActionNeeded`. */
export function toCitizenResultLabel(state: ReleasedReviewState): CitizenResultLabel {
  switch (state) {
    case "released_follow_up":
      return "followUpAgreed";
    case "released_no_action":
      return "noActionNeeded";
    case "dismissed_with_reason":
      return "reviewedNoActionNeeded";
  }
}

/** A reason *key* is multi-part `snake_case` (e.g. `glucose_context_corrected`); a single word
 * such as `correction` may be free text typed by a clinician, so it never leaves either. */
const REASON_KEY = /^[a-z][a-z0-9]*(?:_[a-z0-9]+)+$/u;

function readingsOf(values: {
  systolic: number | null;
  diastolic: number | null;
  glucoseValue: number | null;
  glucoseUnit: GlucoseUnit | null;
  glucoseContext: GlucoseContext | null;
}): CitizenReadings {
  return {
    systolic: values.systolic,
    diastolic: values.diastolic,
    bloodPressureUnit: values.systolic !== null || values.diastolic !== null ? "mmHg" : null,
    glucoseValue: values.glucoseValue,
    glucoseUnit: values.glucoseUnit,
    glucoseContext: values.glucoseContext,
  };
}

/** The latest review of each screening (a screening has at most one in practice). */
function latestReviewBy(reviews: readonly ReviewLike[]): Map<string, ReviewLike> {
  const map = new Map<string, ReviewLike>();
  for (const review of reviews) {
    const current = map.get(review.screeningId);
    if (!current || review.updatedAt > current.updatedAt) map.set(review.screeningId, review);
  }
  return map;
}

/** Projects one screening (with its review) for the wallet; null = not visible. */
export function toCitizenObservation(
  screening: ScreeningLike,
  review: ReviewLike | null,
): CitizenObservationItem | null {
  const state = deriveCitizenReviewState(screening, review);
  if (state === null) return null;
  if (state === "awaiting_review") {
    return {
      kind: "pending_review",
      id: screening.id,
      patientId: screening.patientId,
      measuredAt: screening.measuredAt,
    };
  }
  const current = effectiveReadings(screening);
  const amended = screening.amendments.length > 0;
  return {
    kind: "released",
    id: screening.id,
    patientId: screening.patientId,
    screeningId: screening.id,
    reviewId: review?.id ?? null,
    reviewState: state,
    label: toCitizenResultLabel(state),
    measuredAt: current.measuredAt,
    facilityId: screening.facilityId,
    readings: readingsOf(current),
    originalReadings: amended ? readingsOf(screening) : null,
    amendments: screening.amendments.map((a) => ({
      field: a.field,
      before: a.before,
      after: a.after,
      amendedBy: a.amendedBy,
      amendedAt: a.amendedAt,
      reasonKey: REASON_KEY.test(a.reason) ? a.reason : null,
    })),
    reviewedBy: review?.reviewedBy ?? review?.decision?.decidedBy ?? null,
    reviewedAt: review?.reviewedAt ?? review?.decision?.decidedAt ?? null,
  };
}

/**
 * The patient's citizen-visible results: pending placeholders first, then released results
 * newest first. Drafts and other patients' screenings are dropped.
 */
export function selectReleasedObservations(input: {
  patientId: string;
  screenings: readonly ScreeningLike[];
  reviews: readonly ReviewLike[];
}): CitizenObservationItem[] {
  const reviews = latestReviewBy(input.reviews);
  const items: CitizenObservationItem[] = [];
  for (const screening of input.screenings) {
    if (screening.patientId !== input.patientId) continue;
    const item = toCitizenObservation(screening, reviews.get(screening.id) ?? null);
    if (item) items.push(item);
  }
  const rank = (i: CitizenObservationItem) => (i.kind === "pending_review" ? 0 : 1);
  return items.sort(
    (a, b) =>
      rank(a) - rank(b) ||
      (a.measuredAt < b.measuredAt ? 1 : a.measuredAt > b.measuredAt ? -1 : 0) ||
      (a.id < b.id ? -1 : a.id > b.id ? 1 : 0),
  );
}

/** Minimal acknowledgement shape the selector joins (`NextStepAcknowledgement`). */
export type InstructionAckLike = { id: string; instructionId: string; acknowledgedAt: IsoUtc };

/** An approved next step (logical `ctz_care_instructions` row with `approval_state`). */
export type ApprovedInstruction = CareInstruction & {
  approvalState: "approved";
  /** Derived from the linked referral / follow-up (`deriveInstructionProgress`). */
  progress: InstructionProgress;
  /** Appointment time passed while still planned — a notice, never "overdue". */
  datePassed: boolean;
  /** Review the step came from (links a result to its next step); null when unknown. */
  reviewId: ReviewId | null;
  acknowledgement: { id: string; acknowledgedAt: IsoUtc } | null;
  /**
   * CTZ-04: when the care team recorded the step as done, and with which evidence type (null
   * when not completed). The wallet shows "Confirmed by your care team" only with an evidence
   * type; a delivered reminder or an acknowledgement never makes a step completed.
   */
  completion: { completedAt: IsoUtc; evidenceType: CompletionEvidenceType | null } | null;
};

type ReferralSource = Pick<Referral, "id" | "status" | "completionEvidence" | "reviewId">;
type FollowUpSource = Pick<
  FollowUp,
  "id" | "status" | "attempts" | "outcome" | "referralId" | "reviewId"
>;

/** Completion facts of a `completed` step from its source record (null otherwise). */
function completionOf(
  progress: InstructionProgress,
  source: ReferralSource | FollowUpSource | null,
): ApprovedInstruction["completion"] {
  if (progress !== "completed" || source === null) return null;
  if ("completionEvidence" in source) {
    const evidence = source.completionEvidence;
    return evidence ? { completedAt: evidence.recordedAt, evidenceType: evidence.type } : null;
  }
  const outcome = source.outcome;
  return outcome ? { completedAt: outcome.occurredAt, evidenceType: outcome.evidenceType } : null;
}

/**
 * Only care-team-approved (`released`) instructions of the patient, with derived progress and
 * date-passed notice; newest release first. Withdrawn instructions never appear.
 */
export function selectApprovedInstructions(input: {
  patientId: string;
  instructions: readonly CareInstruction[];
  referrals: readonly ReferralSource[];
  followUps: readonly FollowUpSource[];
  acks?: readonly InstructionAckLike[];
  now: Date;
}): ApprovedInstruction[] {
  const referrals = new Map(input.referrals.map((r) => [r.id as string, r]));
  const followUps = new Map(input.followUps.map((f) => [f.id as string, f]));
  const acks = new Map<string, InstructionAckLike>();
  for (const ack of input.acks ?? []) {
    const current = acks.get(ack.instructionId);
    if (!current || ack.acknowledgedAt < current.acknowledgedAt) acks.set(ack.instructionId, ack);
  }
  const out: ApprovedInstruction[] = [];
  for (const instruction of input.instructions) {
    if (instruction.patientId !== input.patientId || instruction.status !== "released") continue;
    let progress: InstructionProgress;
    let reviewId: ReviewId | null = null;
    let source: ReferralSource | FollowUpSource | null = null;
    if (instruction.sourceType === "referral") {
      const referral = referrals.get(instruction.sourceId) ?? null;
      source = referral;
      progress = deriveInstructionProgress(instruction, referral);
      reviewId = referral?.reviewId ?? null;
    } else if (instruction.sourceType === "follow_up") {
      const followUp = followUps.get(instruction.sourceId) ?? null;
      source = followUp;
      progress = deriveInstructionProgress(instruction, followUp);
      const viaReferral = followUp?.referralId ? referrals.get(followUp.referralId) : undefined;
      reviewId = followUp?.reviewId ?? viaReferral?.reviewId ?? null;
    } else {
      progress = deriveInstructionProgress(instruction, null);
      reviewId = instruction.sourceId as ReviewId;
    }
    const ack = acks.get(instruction.id);
    out.push({
      ...instruction,
      approvalState: "approved",
      progress,
      datePassed: deriveDatePassed(instruction.appointmentAt, progress, input.now),
      reviewId,
      acknowledgement: ack ? { id: ack.id, acknowledgedAt: ack.acknowledgedAt } : null,
      completion: completionOf(progress, source),
    });
  }
  return out.sort((a, b) =>
    a.releasedAt < b.releasedAt
      ? 1
      : a.releasedAt > b.releasedAt
        ? -1
        : a.id < b.id
          ? -1
          : a.id > b.id
            ? 1
            : 0,
  );
}
