/**
 * Derived indicators. These are the shared helpers that CLN-05/08, HWM-03/07, ADM-04/05 and
 * CTZ consume — app phases must not re-implement them.
 *
 * Wording: "past due date (demo timing)" — never call a patient clinically overdue without
 * approved timing rules (spec). Citizen wording uses `deriveDatePassed`, never "overdue".
 */
import type { CareInstruction } from "./entities/care-instruction.ts";
import type { FollowUp } from "./entities/follow-up.ts";
import type { Referral } from "./entities/referral.ts";
import type { Review } from "./entities/review.ts";
import type { AmendableValue, Screening } from "./entities/screening.ts";
import type { SyncOperation } from "./entities/sync-operation.ts";
import type {
  AmendableScreeningField,
  EntitySyncState,
  GlucoseContext,
  GlucoseUnit,
  InstructionProgress,
  PathwayStage,
} from "./enums.ts";

/** i18n key for the derived past-due label (EN: "Past due date (demo timing)"; FND-04). */
export const PAST_DUE_LABEL_KEY = "domain:derived.pastDueDemoTiming" as const;

const isBefore = (iso: string, now: Date): boolean => Date.parse(iso) < now.getTime();

/** Not completed and `dueAt < now`. `dueAt === now` is NOT past due. */
export function isFollowUpOverdue(fu: Pick<FollowUp, "status" | "dueAt">, now: Date): boolean {
  return fu.status !== "completed" && isBefore(fu.dueAt, now);
}

/** Not completed / cancelled and `dueAt < now`. `dueAt === now` is NOT past due. */
export function isReferralOverdue(ref: Pick<Referral, "status" | "dueAt">, now: Date): boolean {
  return (
    ref.status !== "completed" && ref.status !== "cancelled_with_reason" && isBefore(ref.dueAt, now)
  );
}

export type EffectiveReadings = {
  measuredAt: string;
  systolic: number | null;
  diastolic: number | null;
  glucoseValue: number | null;
  glucoseUnit: GlucoseUnit | null;
  glucoseContext: GlucoseContext | null;
  /** Fields changed by at least one amendment, in first-amended order. */
  amendedFields: AmendableScreeningField[];
};

/**
 * Current values of a screening: the original fields with amendments applied in order.
 * The original fields on the screening are retained untouched.
 */
export function effectiveReadings(
  screening: Pick<
    Screening,
    | "measuredAt"
    | "systolic"
    | "diastolic"
    | "glucoseValue"
    | "glucoseUnit"
    | "glucoseContext"
    | "amendments"
  >,
): EffectiveReadings {
  const values: Record<AmendableScreeningField, AmendableValue> = {
    measuredAt: screening.measuredAt,
    systolic: screening.systolic,
    diastolic: screening.diastolic,
    glucoseValue: screening.glucoseValue,
    glucoseUnit: screening.glucoseUnit,
    glucoseContext: screening.glucoseContext,
  };
  const amendedFields: AmendableScreeningField[] = [];
  for (const amendment of screening.amendments) {
    values[amendment.field] = amendment.after;
    if (!amendedFields.includes(amendment.field)) amendedFields.push(amendment.field);
  }
  return {
    measuredAt: values.measuredAt as string,
    systolic: values.systolic as number | null,
    diastolic: values.diastolic as number | null,
    glucoseValue: values.glucoseValue as number | null,
    glucoseUnit: values.glucoseUnit as GlucoseUnit | null,
    glucoseContext: values.glucoseContext as GlucoseContext | null,
    amendedFields,
  };
}

type InstructionSource =
  | Pick<Referral, "status" | "completionEvidence">
  | Pick<FollowUp, "status" | "attempts" | "outcome">
  | Pick<Review, "status" | "evidenceSnapshot">
  | null;

/**
 * Citizen-visible progress of a released care instruction, derived from its linked
 * referral / follow-up (never stored twice).
 * - withdrawn instruction → cancelled
 * - referral: completed → completed; cancelled_with_reason → cancelled; else planned
 * - follow-up: completed with outcome `unable_to_reach` / `declined` → cancelled;
 *   other completed → completed; else planned
 * - review source or no source → planned
 */
export function deriveInstructionProgress(
  instruction: Pick<CareInstruction, "status">,
  source: InstructionSource,
): InstructionProgress {
  if (instruction.status === "withdrawn") return "cancelled";
  if (source === null || "evidenceSnapshot" in source) return "planned";
  if ("completionEvidence" in source) {
    if (source.status === "completed") return "completed";
    if (source.status === "cancelled_with_reason") return "cancelled";
    return "planned";
  }
  if (source.status !== "completed") return "planned";
  const kind = source.outcome?.kind;
  return kind === "unable_to_reach" || kind === "declined" ? "cancelled" : "completed";
}

/**
 * Citizen "date has passed" notice: true only when the step is still `planned` and its
 * appointment time is strictly before now. Never named or rendered as "overdue".
 */
export function deriveDatePassed(
  appointmentAt: string | null,
  progress: InstructionProgress,
  now: Date,
): boolean {
  return appointmentAt !== null && progress === "planned" && isBefore(appointmentAt, now);
}

/**
 * Per-entity sync indicator from the op queue (superseded ops are ignored):
 * conflict / needs_resolution → `conflict`; blocked_revoked → `blocked`; sending → `syncing`;
 * queued / retryable_failure → `saved_locally`; latest remaining op rejected → `rejected`;
 * otherwise (all acknowledged, or no ops) → `synced`.
 */
export function deriveSyncState(
  entityId: string,
  ops: readonly Pick<SyncOperation, "entityId" | "status" | "localSeq">[],
): EntitySyncState {
  const live = ops.filter((op) => op.entityId === entityId && op.status !== "superseded");
  const any = (...statuses: SyncOperation["status"][]): boolean =>
    live.some((op) => statuses.includes(op.status));

  if (any("conflict", "needs_resolution")) return "conflict";
  if (any("blocked_revoked")) return "blocked";
  if (any("sending")) return "syncing";
  if (any("queued", "retryable_failure")) return "saved_locally";
  const latest = live.reduce<(typeof live)[number] | undefined>(
    (acc, op) => (acc === undefined || op.localSeq > acc.localSeq ? op : acc),
    undefined,
  );
  return latest?.status === "rejected" ? "rejected" : "synced";
}

export type PathwayInput = {
  screening: Pick<Screening, "status">;
  review?: Pick<Review, "status" | "decision"> | null;
  referrals: readonly Pick<Referral, "status" | "dueAt">[];
  followUps: readonly Pick<FollowUp, "status" | "dueAt" | "clinicianConfirmation">[];
};

/**
 * Maps per-entity machine states onto the FRD uppercase lifecycle (reporting only):
 * DRAFT_SCREENING → RECORDED → REVIEW_REQUIRED | NO_REVIEW_REQUIRED → REVIEWED →
 * REFERRAL_OPEN | FOLLOW_UP_PLANNED | CLOSED_WITH_REASON → FOLLOW_UP_COMPLETED | OVERDUE → CLOSED.
 *
 * After a recorded action: any past-due open referral / follow-up → OVERDUE; open referral →
 * REFERRAL_OPEN; open follow-up → FOLLOW_UP_PLANNED; a completed follow-up awaiting clinician
 * confirmation → FOLLOW_UP_COMPLETED; something completed → CLOSED; only cancelled referrals →
 * CLOSED_WITH_REASON; nothing linked → CLOSED for `no_further_action`, otherwise REVIEWED.
 * A dismissed review → CLOSED_WITH_REASON.
 */
export function derivePathwayStage(input: PathwayInput, now: Date): PathwayStage {
  const { screening, review, referrals, followUps } = input;
  switch (screening.status) {
    case "draft":
      return "DRAFT_SCREENING";
    case "submitted":
      return "RECORDED";
    case "no_review_required":
      return "NO_REVIEW_REQUIRED";
    case "review_required":
      break;
  }

  if (!review || review.status === "pending" || review.status === "in_review") {
    return "REVIEW_REQUIRED";
  }
  if (review.status === "dismissed_with_reason") return "CLOSED_WITH_REASON";

  if (
    referrals.some((ref) => isReferralOverdue(ref, now)) ||
    followUps.some((fu) => isFollowUpOverdue(fu, now))
  ) {
    return "OVERDUE";
  }
  const openReferral = referrals.some(
    (ref) => ref.status !== "completed" && ref.status !== "cancelled_with_reason",
  );
  if (openReferral) return "REFERRAL_OPEN";
  if (followUps.some((fu) => fu.status !== "completed")) return "FOLLOW_UP_PLANNED";
  if (followUps.some((fu) => fu.clinicianConfirmation.status === "pending")) {
    return "FOLLOW_UP_COMPLETED";
  }
  if (followUps.length > 0 || referrals.some((ref) => ref.status === "completed")) {
    return "CLOSED";
  }
  if (referrals.length > 0) return "CLOSED_WITH_REASON";
  return review.decision?.kind === "no_further_action" ? "CLOSED" : "REVIEWED";
}
