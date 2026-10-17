/**
 * Timeline projection (CTZ-06) — a PURE function over what the wallet may already read
 * (released results + value-less pending placeholders, approved next steps, the citizen's own
 * acknowledgements, reminders and correction requests). No I/O, no clock reads: `now` is passed
 * in (the demo clock) and only used to re-derive the "date has passed" notice.
 *
 * Rules (each one unit-tested in `__tests__/buildCitizenTimeline.test.ts`):
 * - released result → `done` "Check recorded" (measured_at) + `done` "Reviewed by your care
 *   team" (released_at; only when a professional reviewed it — a dismissed flag is "reviewed").
 * - awaiting review → `waiting`, no values and no flag date (the placeholder has none).
 * - approved step `planned` → `waiting` ("Appointment on {date}" / "Next step agreed"), with
 *   the neutral date-passed line when `deriveDatePassed` (never "overdue").
 * - step `completed` WITH an evidence type → `done` "… — confirmed by your care team".
 *   Without evidence (should not exist) it stays `waiting` and logs a dev warning.
 * - step `cancelled` (cancelled_with_reason, withdrawn, follow-up unable_to_reach / declined via
 *   `deriveInstructionProgress`) → `cancelled`; the reason is never shown.
 * - acknowledgement → `info` "You read your next step"; delivered / seen reminder → `info`
 *   "Reminder sent (demo)". Neither is EVER `done`.
 * - each amendment of a released result → `changed` "Your record was updated" with the change
 *   detail (field, before, after, who, when, reason KEY — clinician free text never reaches it).
 * - correction request → `waiting` while open (`info` once answered) + a resolution row
 *   (`changed` when the record was corrected, `info` when no change was needed).
 * - anything that is not an approved (`released`) step is dropped defensively (the repository
 *   already excludes drafts, withdrawn steps and unreleased referrals).
 */
import type { CorrectionRequest } from "@laif/contracts";
import {
  deriveDatePassed,
  type AmendableScreeningField,
  type AmendableValue,
  type ApprovedInstruction,
  type CitizenObservationItem,
  type InstructionAckLike,
  type PersonaId,
  type Reminder,
} from "@laif/domain";
import type { TranslationKey } from "@laif/ui-native";

import { TIMELINE_FILTER_VALUES, type TimelineFilterValue } from "../../state/session.ts";
import { resultKindKey } from "../health/copy.ts";

export const TIMELINE_STATES = ["done", "waiting", "changed", "cancelled", "info"] as const;
export type TimelineState = (typeof TIMELINE_STATES)[number];

export type TimelineKind =
  | "check_recorded"
  | "reviewed"
  | "awaiting_review"
  | "next_step"
  | "next_step_read"
  | "reminder_sent"
  | "record_updated"
  | "correction_requested"
  | "correction_resolved";

/** A param the row resolves at render time (language-dependent). */
export type TimelineParam =
  | { type: "text"; value: string }
  | { type: "date"; iso: string }
  | { type: "key"; key: TranslationKey };

/** Who did it and when (shown by `ProvenanceLine`). */
export type TimelineProvenance = {
  kind: "reviewed" | "approved" | "updated";
  /** Demo persona id of the professional; null = "your care team". */
  personaId: PersonaId | null;
  at: string;
  reasonKey: string | null;
};

/** The "what changed" detail of an amended result (original retained). */
export type TimelineChange = {
  observationId: string;
  field: AmendableScreeningField;
  before: AmendableValue;
  after: AmendableValue;
  amendedBy: PersonaId;
  amendedAt: string;
  reasonKey: string | null;
};

/** Where tapping the row goes (`router.push` input); null = not tappable / sheet only. */
export type TimelineLink =
  | { pathname: "/health/[observationId]"; params: { observationId: string } }
  | { pathname: "/next-steps/[instructionId]"; params: { instructionId: string } }
  | { pathname: "/reminders" };

export type TimelineItem = {
  id: string;
  kind: TimelineKind;
  state: TimelineState;
  occurredAt: string;
  titleKey: TranslationKey;
  bodyKey: TranslationKey | null;
  params: Record<string, TimelineParam>;
  /** Extra neutral line (date has passed). */
  noteKey: TranslationKey | null;
  provenance: TimelineProvenance | null;
  linkRoute: TimelineLink | null;
  /** Only on `record_updated`: opens the ChangeDetailSheet. */
  change: TimelineChange | null;
};

export type TimelineInput = {
  observations: readonly CitizenObservationItem[];
  instructions: readonly ApprovedInstruction[];
  /** Acknowledgements (defaults to the ones joined onto the approved steps). */
  acks?: readonly InstructionAckLike[];
  reminders: readonly Reminder[];
  corrections: readonly CorrectionRequest[];
};

export type TimelineOptions = {
  /** Demo-clock "now" for the date-passed notice (default: the step's stored `datePassed`). */
  now?: Date;
  /** Called for impossible data (completed without evidence); default `console.warn` in dev. */
  warn?: (message: string) => void;
};

const devWarn = (message: string) => {
  if (typeof __DEV__ !== "undefined" && __DEV__) console.warn(message);
};

const item = (
  partial: Pick<TimelineItem, "id" | "kind" | "state" | "occurredAt" | "titleKey"> &
    Partial<TimelineItem>,
): TimelineItem => ({
  bodyKey: null,
  params: {},
  noteKey: null,
  provenance: null,
  linkRoute: null,
  change: null,
  ...partial,
});

const resultLink = (observationId: string): TimelineLink => ({
  pathname: "/health/[observationId]",
  params: { observationId },
});
const stepLink = (instructionId: string): TimelineLink => ({
  pathname: "/next-steps/[instructionId]",
  params: { instructionId },
});

function observationItems(observations: readonly CitizenObservationItem[]): TimelineItem[] {
  const out: TimelineItem[] = [];
  for (const o of observations) {
    if (o.kind === "pending_review") {
      // No values, no flag, no flag date: only that a check is waiting.
      out.push(
        item({
          id: `awaiting:${o.id}`,
          kind: "awaiting_review",
          state: "waiting",
          occurredAt: o.measuredAt,
          titleKey: "citizen:timeline.item.awaitingReview",
        }),
      );
      continue;
    }
    out.push(
      item({
        id: `recorded:${o.id}`,
        kind: "check_recorded",
        state: "done",
        occurredAt: o.measuredAt,
        titleKey: "citizen:timeline.item.checkRecorded",
        bodyKey: resultKindKey(o.readings),
        linkRoute: resultLink(o.id),
      }),
    );
    if (o.reviewedAt !== null) {
      out.push(
        item({
          id: `reviewed:${o.id}`,
          kind: "reviewed",
          state: "done",
          occurredAt: o.reviewedAt,
          titleKey: "citizen:timeline.item.reviewed",
          provenance: {
            kind: "reviewed",
            personaId: o.reviewedBy,
            at: o.reviewedAt,
            reasonKey: null,
          },
          linkRoute: resultLink(o.id),
        }),
      );
    }
    o.amendments.forEach((a, index) =>
      out.push(
        item({
          id: `updated:${o.id}:${index}`,
          kind: "record_updated",
          state: "changed",
          occurredAt: a.amendedAt,
          titleKey: "citizen:timeline.item.recordUpdated",
          bodyKey: `citizen:timeline.change.fields.${a.field}` as TranslationKey,
          provenance: {
            kind: "updated",
            personaId: a.amendedBy,
            at: a.amendedAt,
            reasonKey: a.reasonKey,
          },
          change: {
            observationId: o.id,
            field: a.field,
            before: a.before,
            after: a.after,
            amendedBy: a.amendedBy,
            amendedAt: a.amendedAt,
            reasonKey: a.reasonKey,
          },
        }),
      ),
    );
  }
  return out;
}

function stepItem(step: ApprovedInstruction, options: TimelineOptions): TimelineItem {
  const base = { id: `step:${step.id}`, kind: "next_step" as const, linkRoute: stepLink(step.id) };
  if (step.progress === "completed") {
    if (step.completion !== null && step.completion.evidenceType !== null) {
      return item({
        ...base,
        state: "done",
        occurredAt: step.completion.completedAt,
        titleKey:
          step.kind === "follow_up"
            ? "citizen:timeline.item.followUpDone"
            : "citizen:timeline.item.appointmentAttended",
      });
    }
    (options.warn ?? devWarn)(
      `buildCitizenTimeline: step ${step.id} is completed without completion evidence; shown as waiting`,
    );
  }
  if (step.progress === "cancelled") {
    return item({
      ...base,
      state: "cancelled",
      occurredAt: step.updatedAt,
      titleKey: "citizen:timeline.item.stepCancelled",
    });
  }
  // Planned (or completed without evidence — never shown as done).
  const datePassed =
    options.now === undefined
      ? step.datePassed
      : deriveDatePassed(step.appointmentAt, "planned", options.now);
  return item({
    ...base,
    state: "waiting",
    occurredAt: step.releasedAt,
    titleKey:
      step.appointmentAt === null
        ? "citizen:timeline.item.stepAgreed"
        : "citizen:timeline.item.appointmentOn",
    params: step.appointmentAt === null ? {} : { date: { type: "date", iso: step.appointmentAt } },
    noteKey: datePassed ? "citizen:timeline.item.datePassed" : null,
    provenance: {
      kind: "approved",
      personaId: step.releasedBy,
      at: step.releasedAt,
      reasonKey: null,
    },
  });
}

function correctionItems(corrections: readonly CorrectionRequest[]): TimelineItem[] {
  const out: TimelineItem[] = [];
  for (const c of corrections) {
    const resolved = c.status === "resolved_amended" || c.status === "resolved_no_change";
    const link = c.targetType === "screening" ? resultLink(c.targetId) : null;
    out.push(
      item({
        id: `correction:${c.id}`,
        kind: "correction_requested",
        state: resolved ? "info" : "waiting",
        occurredAt: c.createdAt,
        titleKey: "citizen:timeline.item.correctionRequested",
        linkRoute: link,
      }),
    );
    if (resolved && c.resolvedAt !== null) {
      out.push(
        item({
          id: `resolved:${c.id}`,
          kind: "correction_resolved",
          state: c.status === "resolved_amended" ? "changed" : "info",
          occurredAt: c.resolvedAt,
          titleKey:
            c.status === "resolved_amended"
              ? "citizen:timeline.item.correctionResolved"
              : "citizen:timeline.item.correctionNoChange",
          linkRoute: link,
        }),
      );
    }
  }
  return out;
}

/** Newest first; ties keep a stable id order. */
function byNewest(a: TimelineItem, b: TimelineItem): number {
  if (a.occurredAt !== b.occurredAt) return a.occurredAt < b.occurredAt ? 1 : -1;
  return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
}

export function buildCitizenTimeline(
  input: TimelineInput,
  options: TimelineOptions = {},
): TimelineItem[] {
  const items: TimelineItem[] = observationItems(input.observations);

  // Only care-team-approved steps; anything else is dropped (defence in depth).
  const approved = input.instructions.filter(
    (s) => s.approvalState === "approved" && s.status === "released",
  );
  const approvedIds = new Set<string>(approved.map((s) => s.id));
  for (const step of approved) items.push(stepItem(step, options));

  const acks = new Map<string, InstructionAckLike>();
  for (const step of approved) {
    if (step.acknowledgement !== null) {
      acks.set(step.acknowledgement.id, {
        id: step.acknowledgement.id,
        instructionId: step.id,
        acknowledgedAt: step.acknowledgement.acknowledgedAt,
      });
    }
  }
  for (const ack of input.acks ?? []) acks.set(ack.id, ack);
  for (const ack of acks.values()) {
    if (!approvedIds.has(ack.instructionId)) continue;
    items.push(
      item({
        id: `read:${ack.id}`,
        kind: "next_step_read",
        state: "info",
        occurredAt: ack.acknowledgedAt,
        titleKey: "citizen:timeline.item.readNextStep",
        linkRoute: stepLink(ack.instructionId),
      }),
    );
  }

  for (const r of input.reminders) {
    const sent = r.status === "delivered_simulated" || r.status === "acknowledged";
    if (!sent || r.deliveredAt === null) continue;
    items.push(
      item({
        id: `reminder:${r.id}`,
        kind: "reminder_sent",
        state: "info",
        occurredAt: r.deliveredAt,
        titleKey: "citizen:timeline.item.reminderSent",
        linkRoute: { pathname: "/reminders" },
      }),
    );
  }

  items.push(...correctionItems(input.corrections));
  return items.sort(byNewest);
}

// ── Filters ──────────────────────────────────────────────────────────────────

export const TIMELINE_FILTERS = TIMELINE_FILTER_VALUES;
export type TimelineFilter = TimelineFilterValue;

export function matchesFilter(entry: Pick<TimelineItem, "state">, filter: TimelineFilter) {
  switch (filter) {
    case "all":
      return true;
    case "waiting":
      return entry.state === "waiting";
    case "done":
      return entry.state === "done";
    case "changes":
      return entry.state === "changed";
  }
}

export function filterCounts(
  items: readonly Pick<TimelineItem, "state">[],
): Record<TimelineFilter, number> {
  const counts = { all: 0, waiting: 0, done: 0, changes: 0 };
  for (const f of TIMELINE_FILTERS) counts[f] = items.filter((i) => matchesFilter(i, f)).length;
  return counts;
}
