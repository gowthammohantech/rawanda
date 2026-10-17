/**
 * Outcome form schema + client transition guard (HWM-08 tasks 2–3).
 *
 * Outcomes a worker records (FND-02 `FollowUpOutcome` subset):
 * - `attended` → `occurredAt` + `evidenceType` ∈ `WORKER_EVIDENCE_TYPES` (optional note); the
 *   follow-up becomes `completed` with `clinicianConfirmation.status: 'pending'` (repository).
 * - `referred_onward` → `occurredAt` + evidence type; destination is the clinician-set referral
 *   destination (read-only); status → `contacted` (never completes the referral).
 * - `unable_to_reach` → at least one recorded `not_reached` attempt (or the inline attempt this
 *   form records first) + a reason ∈ `UNABLE_TO_REACH_REASONS` (`other` needs text); status →
 *   `unable_to_reach`.
 *
 * `outcomeGuard` is the client-side `followUpTransition` guard: it blocks (with a message, no
 * write) outcomes on completed tasks, `attended` on an `unable_to_reach` task without a reached
 * attempt newer than that outcome, and anything the FND-02 machine forbids.
 */
import { vMsg } from "@laif/contracts";
import {
  CONTACT_METHODS,
  followUpMachine,
  UNABLE_TO_REACH_REASONS,
  WORKER_EVIDENCE_TYPES,
  type ContactMethod,
  type FollowUp,
  type FollowUpStatus,
  type UnableToReachReason,
  type WorkerEvidenceType,
} from "@laif/domain";
import type { FollowUpUpdateCall } from "@laif/repositories";
import { z } from "zod";

import {
  firstIssues,
  followUpTimeIssue,
  type FollowUpTimeDeps,
  type FormIssue,
} from "./attemptSchema.ts";

/** The outcomes offered to a worker, in display order. */
export const WORKER_OUTCOMES = ["attended", "referred_onward", "unable_to_reach"] as const;
export type WorkerOutcome = (typeof WORKER_OUTCOMES)[number];

export const OUTCOME_NOTE_MAX = 300;
export const OTHER_REASON_MIN = 3;
/** Kept short so reason + note stay within the FND-03 500-character note limit. */
export const OTHER_REASON_MAX = 150;

/** Outcomes that need an evidence type (the worker subset of FND-02's list). */
export const OUTCOMES_NEEDING_EVIDENCE: ReadonlySet<WorkerOutcome> = new Set([
  "attended",
  "referred_onward",
]);

export const OUTCOME_TARGET_STATUS: Record<WorkerOutcome, FollowUpStatus> = {
  attended: "completed",
  referred_onward: "contacted",
  unable_to_reach: "unable_to_reach",
};

export type OutcomeFormValues = {
  outcome: WorkerOutcome | null;
  /** UTC ISO; defaults to the demo now. */
  occurredAt: string | null;
  evidenceType: WorkerEvidenceType | null;
  reasonCode: UnableToReachReason | null;
  /** Free text of reason `other`. */
  reasonText: string;
  /** Unable to reach without a recorded unsuccessful attempt: record one inline first. */
  inlineAttempt: boolean;
  inlineMethod: ContactMethod | null;
  note: string;
};

export type OutcomeFormField = keyof OutcomeFormValues;

export const OUTCOME_FORM_FIELDS = [
  "outcome",
  "occurredAt",
  "evidenceType",
  "reasonCode",
  "reasonText",
  "inlineAttempt",
  "inlineMethod",
  "note",
] as const satisfies readonly OutcomeFormField[];

export function initialOutcomeValues(now: Date): OutcomeFormValues {
  return {
    outcome: null,
    occurredAt: now.toISOString(),
    evidenceType: null,
    reasonCode: null,
    reasonText: "",
    inlineAttempt: false,
    inlineMethod: null,
    note: "",
  };
}

type GuardFollowUp = Pick<FollowUp, "status" | "attempts" | "outcome">;

/** True when the follow-up has at least one recorded `not_reached` attempt. */
export function hasUnsuccessfulAttempt(followUp: Pick<FollowUp, "attempts">): boolean {
  return followUp.attempts.some((attempt) => attempt.result === "not_reached");
}

export type OutcomeBlock =
  /** The task is completed: no further outcome. */
  | "completed"
  /** `attended` on `unable_to_reach` needs a reached attempt newer than that outcome. */
  | "needs_reached_attempt"
  /** Unable to reach is already recorded; the supervisor / clinician decides next steps. */
  | "already_unable_to_reach"
  /** Referred onward is already recorded on this task. */
  | "already_referred_onward"
  /** Any other edge the FND-02 follow-up machine forbids (e.g. reassigned away). */
  | "not_allowed";

/**
 * Client transition guard (task 3). `null` = allowed. Never throws; the form shows the blocking
 * message instead of writing, and `recordOutcome()` re-checks it before any write.
 */
export function outcomeGuard(followUp: GuardFollowUp, outcome: WorkerOutcome): OutcomeBlock | null {
  if (followUp.status === "completed") return "completed";
  if (followUp.status === "unable_to_reach") {
    if (outcome === "unable_to_reach") return "already_unable_to_reach";
    if (outcome === "attended") {
      const since = followUp.outcome?.occurredAt ?? "";
      const reachedSince = followUp.attempts.some(
        (attempt) => attempt.result === "reached" && attempt.at > since,
      );
      return reachedSince ? null : "needs_reached_attempt";
    }
  }
  if (outcome === "referred_onward" && followUp.outcome?.kind === "referred_onward") {
    return "already_referred_onward";
  }
  const to = OUTCOME_TARGET_STATUS[outcome];
  if (to !== followUp.status && !followUpMachine.can(followUp.status, to)) return "not_allowed";
  return null;
}

/** Block that applies to every outcome (the whole form is replaced by the message). */
export function taskBlock(followUp: GuardFollowUp): OutcomeBlock | null {
  const blocks = WORKER_OUTCOMES.map((outcome) => outcomeGuard(followUp, outcome));
  if (blocks.every((block) => block !== null)) return blocks[0] ?? "not_allowed";
  return null;
}

export type OutcomeSchemaDeps = FollowUpTimeDeps & {
  /** Whether the follow-up already has a `not_reached` attempt. */
  hasUnsuccessfulAttempt: boolean;
};

export function createOutcomeSchema(deps: OutcomeSchemaDeps) {
  return z
    .object({
      outcome: z.enum(WORKER_OUTCOMES).nullable(),
      occurredAt: z.string().nullable(),
      evidenceType: z.enum(WORKER_EVIDENCE_TYPES).nullable(),
      reasonCode: z.enum(UNABLE_TO_REACH_REASONS).nullable(),
      reasonText: z.string(),
      inlineAttempt: z.boolean(),
      inlineMethod: z.enum(CONTACT_METHODS).nullable(),
      note: z.string(),
    })
    .superRefine((v, ctx) => {
      const add = (path: OutcomeFormField, message: string) =>
        ctx.addIssue({ code: "custom", path: [path], message });
      if (v.note.trim().length > OUTCOME_NOTE_MAX) {
        add("note", vMsg("tooLong", { max: OUTCOME_NOTE_MAX }));
      }
      if (v.outcome === null) {
        add("outcome", vMsg("required"));
        return;
      }
      const time = followUpTimeIssue(v.occurredAt, deps);
      if (time !== null) add("occurredAt", time);
      if (OUTCOMES_NEEDING_EVIDENCE.has(v.outcome) && v.evidenceType === null) {
        add("evidenceType", vMsg("followUpEvidenceRequired"));
      }
      if (v.outcome === "unable_to_reach") {
        if (v.reasonCode === null) add("reasonCode", vMsg("required"));
        if (v.reasonCode === "other") {
          const text = v.reasonText.trim();
          if (text.length < OTHER_REASON_MIN) {
            add(
              "reasonText",
              text === "" ? vMsg("required") : vMsg("tooShort", { min: OTHER_REASON_MIN }),
            );
          } else if (text.length > OTHER_REASON_MAX) {
            add("reasonText", vMsg("tooLong", { max: OTHER_REASON_MAX }));
          }
        }
        if (!deps.hasUnsuccessfulAttempt) {
          if (!v.inlineAttempt) add("inlineAttempt", vMsg("attemptRequired"));
          else if (v.inlineMethod === null) add("inlineMethod", vMsg("required"));
        }
      }
    });
}

export function outcomeIssues(
  values: OutcomeFormValues,
  deps: OutcomeSchemaDeps,
): FormIssue<OutcomeFormField>[] {
  const parsed = createOutcomeSchema(deps).safeParse(values);
  return parsed.success ? [] : firstIssues(parsed.error.issues, OUTCOME_FORM_FIELDS);
}

export type RecordOutcomeCall = Extract<FollowUpUpdateCall, { action: "record_outcome" }>;

/** The stored note: `other` reason text first, then the free note. */
function outcomeNote(values: OutcomeFormValues): string {
  const reason =
    values.outcome === "unable_to_reach" && values.reasonCode === "other"
      ? values.reasonText.trim()
      : "";
  const note = values.note.trim();
  return [reason, note].filter((part) => part !== "").join("\n");
}

/** Valid form values → the FND-03 `record_outcome` call against `expectedVersion`. */
export function toOutcomeCall(
  values: OutcomeFormValues,
  followUpId: string,
  expectedVersion: number,
): RecordOutcomeCall {
  if (values.outcome === null || values.occurredAt === null) {
    throw new Error("toOutcomeCall: incomplete values");
  }
  const note = outcomeNote(values);
  const needsEvidence = OUTCOMES_NEEDING_EVIDENCE.has(values.outcome);
  return {
    followUpId,
    expectedVersion,
    action: "record_outcome",
    outcome: values.outcome,
    occurredAt: values.occurredAt,
    ...(needsEvidence && values.evidenceType !== null ? { evidenceType: values.evidenceType } : {}),
    ...(values.outcome === "unable_to_reach" && values.reasonCode !== null
      ? { reasonCode: values.reasonCode }
      : {}),
    ...(note === "" ? {} : { note }),
  };
}
