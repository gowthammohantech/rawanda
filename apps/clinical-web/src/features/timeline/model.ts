/**
 * Timeline view models (CLN-04), pure and unit-tested:
 * - `toScreeningEntries` — screenings newest first by EFFECTIVE `measuredAt` (amendments
 *   applied via FND-02 `effectiveReadings`), grouped by Kigali calendar day, with same-day
 *   repeat readings paired and the display status (review required / no review required /
 *   reviewed; `amended` is shown in addition).
 * - `toFollowUpEvents` — review decisions, referral created / scheduled / completed / cancelled
 *   and follow-up assigned / contact attempts / completed merged by `occurredAt` (newest first).
 *   OVERDUE is derived with the FND-02 helpers (`isReferralOverdue` / `isFollowUpOverdue`,
 *   `dueAt < demo now` and not terminal) — never stored.
 */
import {
  effectiveReadings,
  isFollowUpOverdue,
  isReferralOverdue,
  type EffectiveReadings,
  type FollowUp,
  type PersonaId,
  type Referral,
  type Review,
  type Screening,
} from "@laif/domain";
import type { Tone } from "@laif/ui-web";
import { utcIsoToKigaliWallTime } from "@laif/ui-web";

/** Review statuses that are still open (the amendment callout, CLN-04 task 6). */
export const OPEN_REVIEW_STATUSES: readonly Review["status"][] = ["pending", "in_review"];

export type ScreeningDisplayStatus = "review_required" | "no_review_required" | "reviewed";

export type ScreeningEntry = {
  screening: Screening;
  readings: EffectiveReadings;
  /** Kigali calendar day `YYYY-MM-DD` of the effective `measuredAt`. */
  day: string;
  status: ScreeningDisplayStatus;
  amended: boolean;
  /** The screening's review (if any). */
  review: Review | null;
  /** Other screenings of the same patient on the same Kigali day (repeat readings). */
  pairedWith: { id: string; measuredAt: string }[];
};

export type ScreeningDayGroup = { day: string; dateIso: string; entries: ScreeningEntry[] };

const DECIDED: ReadonlySet<Review["status"]> = new Set([
  "action_recorded",
  "dismissed_with_reason",
]);

/** Kigali calendar day of a UTC ISO timestamp. */
export const kigaliDay = (iso: string): string => utcIsoToKigaliWallTime(iso).slice(0, 10);

export function displayStatus(screening: Screening, review: Review | null): ScreeningDisplayStatus {
  if (review !== null && DECIDED.has(review.status)) return "reviewed";
  if (screening.status === "review_required" || review !== null) return "review_required";
  return "no_review_required";
}

export const STATUS_TONE: Readonly<Record<ScreeningDisplayStatus, Tone>> = {
  review_required: "warning",
  no_review_required: "positive",
  reviewed: "info",
};

export function toScreeningEntries(
  screenings: readonly Screening[],
  reviews: readonly Review[] = [],
): ScreeningEntry[] {
  const reviewByScreening = new Map<string, Review>();
  for (const review of reviews) {
    const existing = reviewByScreening.get(review.screeningId);
    if (existing === undefined || review.createdAt > existing.createdAt) {
      reviewByScreening.set(review.screeningId, review);
    }
  }
  const base = screenings
    .filter((s) => s.status !== "draft")
    .map((screening) => {
      const readings = effectiveReadings(screening);
      const review = reviewByScreening.get(screening.id) ?? null;
      return {
        screening,
        readings,
        day: kigaliDay(readings.measuredAt),
        status: displayStatus(screening, review),
        amended: screening.amendments.length > 0,
        review,
        pairedWith: [] as { id: string; measuredAt: string }[],
      };
    })
    .sort(
      (a, b) =>
        b.readings.measuredAt.localeCompare(a.readings.measuredAt) ||
        b.screening.id.localeCompare(a.screening.id),
    );
  for (const entry of base) {
    entry.pairedWith = base
      .filter(
        (other) =>
          other !== entry &&
          other.day === entry.day &&
          other.screening.patientId === entry.screening.patientId,
      )
      .map((other) => ({ id: other.screening.id, measuredAt: other.readings.measuredAt }));
  }
  return base;
}

export function groupByDay(entries: readonly ScreeningEntry[]): ScreeningDayGroup[] {
  const groups: ScreeningDayGroup[] = [];
  for (const entry of entries) {
    const last = groups[groups.length - 1];
    if (last !== undefined && last.day === entry.day) last.entries.push(entry);
    else groups.push({ day: entry.day, dateIso: entry.readings.measuredAt, entries: [entry] });
  }
  return groups;
}

/** DOM id of a screening card (repeat-reading links). */
export const screeningAnchorId = (id: string): string => `screening-${id}`;

// ── Follow-up timeline ───────────────────────────────────────────────────────

export type FollowUpEventKind =
  | "reviewDecided"
  | "referralCreated"
  | "referralScheduled"
  | "referralCompleted"
  | "referralCancelled"
  | "followUpAssigned"
  | "followUpAttempt"
  | "followUpCompleted";

export type FollowUpEvent = {
  id: string;
  kind: FollowUpEventKind;
  occurredAt: string;
  actorId: PersonaId | null;
  /** Status pill of the event's entity (domain status group + value). */
  status:
    | { group: "status.review"; value: Review["status"] }
    | { group: "status.referral"; value: Referral["status"] }
    | { group: "status.followUp"; value: FollowUp["status"] };
  dueAt: string | null;
  /** Derived: entity not terminal and `dueAt < demo now` (only on events carrying `dueAt`). */
  overdue: boolean;
  /** Event-specific values (decision kind, destination, purpose, result, outcome …). */
  values: Record<string, string>;
  /** Assigned worker of a follow-up assignment (`null` = unassigned). */
  assigneeId?: PersonaId | null;
  /** Link target (review detail). */
  reviewId?: string;
  /** Link target (CLN-08: the referral drawer `/clinical/referrals?id=`). */
  referralId?: string;
};

export type FollowUpSources = {
  reviews: readonly Review[];
  referrals: readonly Referral[];
  followUps: readonly FollowUp[];
};

export function toFollowUpEvents(sources: FollowUpSources, nowIso: string): FollowUpEvent[] {
  const now = new Date(nowIso);
  const events: FollowUpEvent[] = [];
  const reviewById = new Map(sources.reviews.map((r) => [r.id as string, r]));

  for (const review of sources.reviews) {
    if (review.decision === null) continue;
    events.push({
      id: `review-${review.id}`,
      kind: "reviewDecided",
      occurredAt: review.decision.decidedAt,
      actorId: review.decision.decidedBy,
      status: { group: "status.review", value: review.status },
      dueAt: null,
      overdue: false,
      values: { decision: review.decision.kind },
      reviewId: review.id,
    });
  }

  for (const referral of sources.referrals) {
    const status = { group: "status.referral", value: referral.status } as const;
    const overdue = isReferralOverdue(referral, now);
    const linked = reviewById.get(referral.reviewId);
    events.push({
      id: `referral-${referral.id}-created`,
      referralId: referral.id,
      kind: "referralCreated",
      occurredAt: referral.requestedAt,
      actorId: linked?.decision?.decidedBy ?? linked?.reviewedBy ?? null,
      status,
      dueAt: referral.dueAt,
      overdue,
      values: { destination: referral.destination },
    });
    if (referral.appointmentAt !== null) {
      events.push({
        id: `referral-${referral.id}-scheduled`,
        referralId: referral.id,
        kind: "referralScheduled",
        occurredAt:
          referral.updatedAt < referral.requestedAt ? referral.requestedAt : referral.updatedAt,
        actorId: null,
        status,
        dueAt: null,
        overdue: false,
        values: { appointmentAt: referral.appointmentAt },
      });
    }
    if (referral.status === "completed") {
      events.push({
        id: `referral-${referral.id}-completed`,
        referralId: referral.id,
        kind: "referralCompleted",
        occurredAt:
          referral.completedAt ?? referral.completionEvidence?.recordedAt ?? referral.updatedAt,
        actorId: referral.completionEvidence?.recordedBy ?? null,
        status,
        dueAt: null,
        overdue: false,
        values: { outcome: referral.completionEvidence?.outcome ?? "" },
      });
    }
    if (referral.status === "cancelled_with_reason") {
      events.push({
        id: `referral-${referral.id}-cancelled`,
        referralId: referral.id,
        kind: "referralCancelled",
        occurredAt: referral.updatedAt,
        actorId: null,
        status,
        dueAt: null,
        overdue: false,
        values: { reason: referral.cancelled?.reason ?? "" },
      });
    }
  }

  for (const followUp of sources.followUps) {
    const status = { group: "status.followUp", value: followUp.status } as const;
    const overdue = isFollowUpOverdue(followUp, now);
    const history =
      followUp.assignmentHistory.length > 0
        ? followUp.assignmentHistory
        : [
            {
              workerId: followUp.assignedWorkerId,
              assignedAt: followUp.createdAt,
              assignedBy: null,
              reason: null,
            },
          ];
    history.forEach((assignment, index) => {
      const latest = index === history.length - 1;
      events.push({
        id: `followup-${followUp.id}-assigned-${index}`,
        kind: "followUpAssigned",
        occurredAt: assignment.assignedAt,
        actorId: assignment.assignedBy,
        status,
        // Only the current assignment carries the (current) due date and the derived pill.
        dueAt: latest ? followUp.dueAt : null,
        overdue: latest && overdue,
        values: { purpose: followUp.purpose },
        assigneeId: assignment.workerId,
      });
    });
    for (const attempt of followUp.attempts) {
      events.push({
        id: `followup-${followUp.id}-attempt-${attempt.id}`,
        kind: "followUpAttempt",
        occurredAt: attempt.at,
        actorId: attempt.recordedBy,
        status,
        dueAt: null,
        overdue: false,
        values: { result: attempt.result, method: attempt.method },
      });
    }
    if (followUp.outcome !== null) {
      events.push({
        id: `followup-${followUp.id}-completed`,
        kind: "followUpCompleted",
        occurredAt: followUp.outcome.occurredAt,
        actorId: followUp.outcome.recordedBy,
        status,
        dueAt: null,
        overdue: false,
        values: { outcome: followUp.outcome.kind },
      });
    }
  }

  return events.sort(
    (a, b) => b.occurredAt.localeCompare(a.occurredAt) || a.id.localeCompare(b.id),
  );
}
