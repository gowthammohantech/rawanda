/**
 * Contact-attempt form schema (HWM-08 task 1). Fields: `attemptedAt` (defaults to the demo now;
 * not later than now + 5 min, not before the task was created), `method` (FND-02
 * `CONTACT_METHODS`; phone is simulated), `result` (`CONTACT_RESULTS`) and an optional note of at
 * most 300 characters (hint: do not record diagnoses). Messages are `vMsg` i18n keys, translated
 * at render time. The output is the FND-03 `record_attempt` action of `FollowUpUpdateInput`.
 */
import { SCREENING_FUTURE_TOLERANCE_MS, vMsg } from "@laif/contracts";
import {
  CONTACT_METHODS,
  CONTACT_RESULTS,
  type ContactMethod,
  type ContactResult,
} from "@laif/domain";
import type { FollowUpUpdateCall } from "@laif/repositories";
import { z } from "zod";

/** Attempt / outcome times may run at most 5 minutes ahead of the demo clock (device drift). */
export const FOLLOW_UP_FUTURE_TOLERANCE_MS = SCREENING_FUTURE_TOLERANCE_MS;
export const ATTEMPT_NOTE_MAX = 300;

export type AttemptFormValues = {
  /** UTC ISO (Kigali wall time in the field), null while incomplete. */
  attemptedAt: string | null;
  method: ContactMethod | null;
  result: ContactResult | null;
  note: string;
};

export type AttemptFormField = keyof AttemptFormValues;

/** Order of the error summary. */
export const ATTEMPT_FORM_FIELDS = [
  "attemptedAt",
  "method",
  "result",
  "note",
] as const satisfies readonly AttemptFormField[];

export function initialAttemptValues(now: Date): AttemptFormValues {
  return { attemptedAt: now.toISOString(), method: null, result: null, note: "" };
}

export type FollowUpTimeDeps = {
  now: () => Date;
  /** The task's creation time (lower bound of attempt / outcome times). */
  createdAt: string;
};

/**
 * Shared time rule of attempts and outcomes: required, a valid instant, ≤ now + 5 min and ≥ the
 * task's creation. Returns the `vMsg` of the first failure, or null.
 */
export function followUpTimeIssue(value: string | null, deps: FollowUpTimeDeps): string | null {
  if (value === null || value === "") return vMsg("required");
  const at = Date.parse(value);
  if (Number.isNaN(at)) return vMsg("invalidDate");
  if (at > deps.now().getTime() + FOLLOW_UP_FUTURE_TOLERANCE_MS) return vMsg("dateInFuture");
  const created = Date.parse(deps.createdAt);
  if (!Number.isNaN(created) && at < created) return vMsg("dateBeforeTaskCreated");
  return null;
}

export function createAttemptSchema(deps: FollowUpTimeDeps) {
  return z
    .object({
      attemptedAt: z.string().nullable(),
      method: z.enum(CONTACT_METHODS).nullable(),
      result: z.enum(CONTACT_RESULTS).nullable(),
      note: z.string(),
    })
    .superRefine((v, ctx) => {
      const add = (path: AttemptFormField, message: string) =>
        ctx.addIssue({ code: "custom", path: [path], message });
      const time = followUpTimeIssue(v.attemptedAt, deps);
      if (time !== null) add("attemptedAt", time);
      if (v.method === null) add("method", vMsg("required"));
      if (v.result === null) add("result", vMsg("required"));
      if (v.note.trim().length > ATTEMPT_NOTE_MAX) {
        add("note", vMsg("tooLong", { max: ATTEMPT_NOTE_MAX }));
      }
    });
}

export type FormIssue<F extends string> = { field: F; message: string };

/** First issue per field, in the given form order. */
export function firstIssues<F extends string>(
  issues: readonly z.core.$ZodIssue[],
  order: readonly F[],
): FormIssue<F>[] {
  const byField = new Map<F, string>();
  for (const issue of issues) {
    const field = issue.path[0] as F;
    if (!byField.has(field)) byField.set(field, issue.message);
  }
  return order.flatMap((field) => {
    const message = byField.get(field);
    return message === undefined ? [] : [{ field, message }];
  });
}

export function attemptIssues(
  values: AttemptFormValues,
  deps: FollowUpTimeDeps,
): FormIssue<AttemptFormField>[] {
  const parsed = createAttemptSchema(deps).safeParse(values);
  return parsed.success ? [] : firstIssues(parsed.error.issues, ATTEMPT_FORM_FIELDS);
}

export type RecordAttemptCall = Extract<FollowUpUpdateCall, { action: "record_attempt" }>;

/** Valid form values → the FND-03 `record_attempt` call against `followUp.version`. */
export function toAttemptCall(
  values: AttemptFormValues,
  followUp: { id: string; version: number },
): RecordAttemptCall {
  if (values.attemptedAt === null || values.method === null || values.result === null) {
    throw new Error("toAttemptCall: incomplete values");
  }
  const note = values.note.trim();
  return {
    followUpId: followUp.id,
    expectedVersion: followUp.version,
    action: "record_attempt",
    at: values.attemptedAt,
    method: values.method,
    result: values.result,
    ...(note === "" ? {} : { note }),
  };
}
