/**
 * Spec §5.2 invariants as assertion functions. Each throws `DomainInvariantError { code }`.
 * Repositories (FND-07) call these inside every write; UIs call them only for pre-checks.
 */
import type { FollowUp } from "./entities/follow-up.ts";
import type { Referral } from "./entities/referral.ts";
import type { ReviewDecision } from "./entities/review.ts";
import type { Screening, ScreeningAmendment } from "./entities/screening.ts";
import type { EntityType, TransitionTrigger } from "./enums.ts";
import { FOLLOW_UP_OUTCOMES_REQUIRING_EVIDENCE } from "./enums.ts";
import { DomainInvariantError } from "./errors.ts";
import { effectiveReadings } from "./derive.ts";

/** ★ Minimum non-whitespace characters for dismissal / cancellation / amendment reasons. */
export const MIN_REASON_NON_WHITESPACE_CHARS = 10;

/** True when `reason` has at least `MIN_REASON_NON_WHITESPACE_CHARS` non-whitespace chars. */
export function hasMinimumReason(reason: string | null | undefined): reason is string {
  return (
    typeof reason === "string" &&
    reason.replace(/\s/gu, "").length >= MIN_REASON_NON_WHITESPACE_CHARS
  );
}

const isNonBlank = (value: unknown): value is string =>
  typeof value === "string" && value.trim().length > 0;

const isTimestamp = (value: unknown): value is string =>
  isNonBlank(value) && !Number.isNaN(Date.parse(value));

/** Every review decision names who decided and when (`DECISION_NOT_ATTRIBUTABLE`). */
export function assertAttributable(
  decision: ReviewDecision | null | undefined,
): asserts decision is ReviewDecision {
  if (!decision || !isNonBlank(decision.decidedBy) || !isTimestamp(decision.decidedAt)) {
    throw new DomainInvariantError("DECISION_NOT_ATTRIBUTABLE");
  }
}

/** Dismissals need a reason of ≥ 10 non-whitespace chars (`DISMISSAL_REASON_REQUIRED`). */
export function assertDismissalReason(reason: string | null | undefined): asserts reason is string {
  if (!hasMinimumReason(reason)) {
    throw new DomainInvariantError("DISMISSAL_REASON_REQUIRED", {
      min: MIN_REASON_NON_WHITESPACE_CHARS,
    });
  }
}

/** Cancellations need a reason of ≥ 10 non-whitespace chars (`CANCELLATION_REASON_REQUIRED`). */
export function assertCancellationReason(
  reason: string | null | undefined,
): asserts reason is string {
  if (!hasMinimumReason(reason)) {
    throw new DomainInvariantError("CANCELLATION_REASON_REQUIRED", {
      min: MIN_REASON_NON_WHITESPACE_CHARS,
    });
  }
}

type CompletableReferral = Pick<Referral, "completionEvidence">;
type CompletableFollowUp = Pick<FollowUp, "outcome">;

/**
 * A completed referral / follow-up needs evidence: type, timestamp and author
 * (`COMPLETION_EVIDENCE_REQUIRED`). For follow-ups the outcome record is the evidence;
 * outcomes in `FOLLOW_UP_OUTCOMES_REQUIRING_EVIDENCE` also need an evidence type, and
 * `unable_to_reach` needs a reason code.
 */
export function assertCompletionEvidence(target: CompletableReferral | CompletableFollowUp): void {
  const fail = (missing: string): never => {
    throw new DomainInvariantError("COMPLETION_EVIDENCE_REQUIRED", { missing });
  };

  if ("completionEvidence" in target) {
    const evidence = target.completionEvidence;
    if (!evidence) return fail("evidence");
    if (!isNonBlank(evidence.type)) fail("type");
    if (!isTimestamp(evidence.recordedAt)) fail("recordedAt");
    if (!isNonBlank(evidence.recordedBy)) fail("recordedBy");
    if (!isNonBlank(evidence.outcome)) fail("outcome");
    return;
  }

  const outcome = target.outcome;
  if (!outcome) return fail("outcome");
  if (!isTimestamp(outcome.occurredAt)) fail("occurredAt");
  if (!isNonBlank(outcome.recordedBy)) fail("recordedBy");
  const needsEvidence = (FOLLOW_UP_OUTCOMES_REQUIRING_EVIDENCE as readonly string[]).includes(
    outcome.kind,
  );
  if (needsEvidence && !isNonBlank(outcome.evidenceType)) fail("type");
  if (outcome.kind === "unable_to_reach" && !isNonBlank(outcome.reasonCode)) fail("reasonCode");
}

/** Only drafts may be edited in place (`SCREENING_IMMUTABLE`). */
export function assertScreeningMutable(screening: Pick<Screening, "id" | "status">): void {
  if (screening.status !== "draft") {
    throw new DomainInvariantError("SCREENING_IMMUTABLE", {
      screeningId: screening.id,
      status: screening.status,
    });
  }
}

/** Fields a draft screening may change in place. */
export type ScreeningDraftPatch = Partial<
  Pick<
    Screening,
    | "measuredAt"
    | "systolic"
    | "diastolic"
    | "glucoseValue"
    | "glucoseUnit"
    | "glucoseContext"
    | "observations"
    | "notes"
    | "captureDurationSeconds"
  >
>;

/** Edits a DRAFT screening. Throws `SCREENING_IMMUTABLE` for any other status. */
export function updateScreeningDraft(
  screening: Screening,
  patch: ScreeningDraftPatch,
  updatedAt: string,
): Screening {
  assertScreeningMutable(screening);
  return { ...screening, ...patch, version: screening.version + 1, updatedAt };
}

/** Amendment input: `before` is computed from the current effective value. */
export type AmendmentInput = Omit<ScreeningAmendment, "before">;

/**
 * The only way to change a submitted screening. Appends an amendment (keeping the original
 * fields and recording the current effective value in `before`); never overwrites.
 * Throws `AMENDMENT_NOT_APPLICABLE` for drafts and `AMENDMENT_REASON_REQUIRED` for a short reason.
 */
export function applyAmendment(screening: Screening, amendment: AmendmentInput): Screening {
  if (screening.status === "draft") {
    throw new DomainInvariantError("AMENDMENT_NOT_APPLICABLE", { screeningId: screening.id });
  }
  if (!hasMinimumReason(amendment.reason)) {
    throw new DomainInvariantError("AMENDMENT_REASON_REQUIRED", {
      min: MIN_REASON_NON_WHITESPACE_CHARS,
    });
  }
  if (!isNonBlank(amendment.amendedBy) || !isTimestamp(amendment.amendedAt)) {
    throw new DomainInvariantError("DECISION_NOT_ATTRIBUTABLE", { amendmentId: amendment.id });
  }
  const before = effectiveReadings(screening)[amendment.field];
  const record: ScreeningAmendment = { ...amendment, before };
  return {
    ...screening,
    amendments: [...screening.amendments, record],
    version: screening.version + 1,
    updatedAt: amendment.amendedAt,
  };
}

/** Optimistic concurrency: stale writes raise `STALE_VERSION` (mapped to 409 in FND-07). */
export function assertVersion(entity: { readonly version: number }, expectedVersion: number): void {
  if (entity.version !== expectedVersion) {
    throw new DomainInvariantError("STALE_VERSION", {
      expectedVersion,
      currentVersion: entity.version,
    });
  }
}

/**
 * A reminder (sent, delivered, acknowledged, cancelled) can never transition a referral or
 * follow-up — no UI may claim completion because a reminder was sent (spec §5.2).
 */
export function assertNotCompletedByReminder(change: {
  trigger: TransitionTrigger;
  entityType: EntityType;
  to?: string;
}): void {
  if (
    change.trigger === "reminder" &&
    (change.entityType === "referral" || change.entityType === "follow_up")
  ) {
    throw new DomainInvariantError("REMINDER_CANNOT_TRANSITION", {
      entityType: change.entityType,
      to: change.to ?? null,
    });
  }
}
