/**
 * Follow-up writes (HWM-08 task 5–7): `recordAttempt()` and `recordOutcome()`.
 *
 * Both go through the FND-07 repository (`repo.updateFollowUp`, actions `record_attempt` /
 * `record_outcome`): ONE store transaction appends the attempt (`FollowUp.attempts[]`) or sets
 * `FollowUp.outcome` + local status (+ `completedAt` and `clinicianConfirmation: pending` for a
 * worker-recorded `attended`), enqueues the `follow_up` sync op with `baseVersion` = the version
 * the form was opened on, and writes the audit (`followup.attempt_recorded` — the phase's
 * `followup.contact_attempted` — / `followup.outcome_recorded` with outcome, evidence type,
 * occurred-at and base version). The UI shows "Saved on this device" until the simulated server
 * acknowledges; the chain rule (FND-07) rebases a second queued op on the same task.
 *
 * Idempotency (T-04): the form instance key is the op's idempotency key. A second call with the
 * same key (double tap, retry after a crash) returns the saved result without a new op:
 * concurrent calls share one promise, and an op that already exists for the key is a replay.
 * The client guard (`outcomeGuard`) and the form schema are re-checked before any write.
 */
import { fnv1a64Hex, type FacilityId, type FollowUp } from "@laif/domain";
import { RepositoryError, type CareRepository } from "@laif/repositories";

import {
  attemptIssues,
  toAttemptCall,
  type AttemptFormField,
  type AttemptFormValues,
  type FormIssue,
} from "../features/followup/attemptSchema.ts";
import {
  hasUnsuccessfulAttempt,
  outcomeGuard,
  outcomeIssues,
  toOutcomeCall,
  type OutcomeBlock,
  type OutcomeFormField,
  type OutcomeFormValues,
} from "../features/followup/outcomeSchema.ts";
import { listForWorker } from "./followUps.ts";

type Scope = { workerId: string; facilityId: FacilityId };

/** The task the form was opened on (its version is the `baseVersion` of the write). */
export type FollowUpTarget = { id: string; version: number };

type WriteRepo = Pick<CareRepository, "listFollowUps" | "listPatients" | "updateFollowUp" | "sync">;

export type WriteOutcome<F extends string> =
  | { status: "saved"; followUp: FollowUp; replayed: boolean }
  | { status: "invalid"; issues: FormIssue<F>[] }
  | { status: "blocked"; block: OutcomeBlock }
  /** The local copy changed since the form opened (never overwritten). */
  | { status: "conflict" }
  /** Not my task in my facility (anymore). */
  | { status: "denied" };

export type AttemptWriteOutcome = WriteOutcome<AttemptFormField>;
export type OutcomeWriteOutcome = WriteOutcome<OutcomeFormField>;

const GUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/iu;

/** Deterministic UUID-shaped key derived from a form key (e.g. the inline attempt's key). */
export function deriveKey(base: string, purpose: string): string {
  const hex = `${fnv1a64Hex(`${purpose}:${base}`)}${fnv1a64Hex(`${purpose}#2:${base}`)}`;
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-4${hex.slice(13, 16)}-8${hex.slice(17, 20)}-${hex.slice(20, 32)}`;
}

/** Form keys are platform UUIDs; anything else (test id generators) is hashed into one. */
export function formKey(raw: string): string {
  return GUID.test(raw) ? raw : deriveKey(raw, "form");
}

const inFlight = new Map<string, Promise<unknown>>();

function once<T>(key: string, run: () => Promise<T>): Promise<T> {
  const running = inFlight.get(key);
  if (running !== undefined) return running as Promise<T>;
  const promise = run().finally(() => inFlight.delete(key));
  inFlight.set(key, promise);
  return promise;
}

async function loadMine(repo: WriteRepo, scope: Scope, followUpId: string) {
  try {
    const rows = await listForWorker(repo, scope);
    return rows.find((row) => row.followUp.id === followUpId)?.followUp ?? null;
  } catch (error) {
    if (error instanceof RepositoryError && error.code === "FORBIDDEN") return null;
    throw error;
  }
}

/** True when an op with this idempotency key is already queued / sent (a replayed submit). */
async function alreadySaved(repo: WriteRepo, followUpId: string, key: string): Promise<boolean> {
  const ops = await repo.sync.list({ entityId: followUpId });
  return ops.some((op) => op.idempotencyKey === key);
}

function mapWriteError(error: unknown): { status: "conflict" | "denied" } | OutcomeWriteOutcome {
  if (error instanceof RepositoryError) {
    if (error.code === "CONFLICT") return { status: "conflict" };
    if (error.code === "FORBIDDEN") return { status: "denied" };
    if (error.code === "VALIDATION_ERROR" && error.reason === "INVALID_TRANSITION") {
      return { status: "blocked", block: "not_allowed" };
    }
  }
  throw error;
}

/** Records one contact attempt (`reached` moves `assigned → contacted`, repository rule). */
export function recordAttempt(
  repo: WriteRepo,
  scope: Scope,
  target: FollowUpTarget,
  values: AttemptFormValues,
  rawKey: string,
  now: Date,
): Promise<AttemptWriteOutcome> {
  const key = formKey(rawKey);
  return once(key, async (): Promise<AttemptWriteOutcome> => {
    const current = await loadMine(repo, scope, target.id);
    if (current === null) return { status: "denied" };
    if (await alreadySaved(repo, target.id, key)) {
      return { status: "saved", followUp: current, replayed: true };
    }
    if (current.status === "completed") return { status: "blocked", block: "completed" };
    const issues = attemptIssues(values, { now: () => now, createdAt: current.createdAt });
    if (issues.length > 0) return { status: "invalid", issues };
    try {
      const result = await repo.updateFollowUp(toAttemptCall(values, target), key);
      return { status: "saved", followUp: result.data, replayed: result.replayed };
    } catch (error) {
      return mapWriteError(error) as AttemptWriteOutcome;
    }
  });
}

/**
 * Records the outcome. For `unable_to_reach` without a recorded unsuccessful attempt the form's
 * inline attempt is written first (its own derived key, so a retry replays it), then the outcome
 * against the version that attempt produced — two ops on the task, chained by the sync queue.
 */
export function recordOutcome(
  repo: WriteRepo,
  scope: Scope,
  target: FollowUpTarget,
  values: OutcomeFormValues,
  rawKey: string,
  now: Date,
): Promise<OutcomeWriteOutcome> {
  const key = formKey(rawKey);
  return once(key, async (): Promise<OutcomeWriteOutcome> => {
    const current = await loadMine(repo, scope, target.id);
    if (current === null) return { status: "denied" };
    if (await alreadySaved(repo, target.id, key)) {
      return { status: "saved", followUp: current, replayed: true };
    }
    if (values.outcome === null) {
      return { status: "invalid", issues: outcomeIssues(values, depsOf(current, now, false)) };
    }
    const block = outcomeGuard(current, values.outcome);
    if (block !== null) return { status: "blocked", block };

    const inline =
      values.outcome === "unable_to_reach" && values.inlineAttempt && values.inlineMethod !== null;
    // A previous run may already have written the inline attempt (crash between the two
    // writes): it is then on the task, and re-sending it below replays the same key.
    const attemptKey = deriveKey(key, "inline-attempt");
    const issues = outcomeIssues(values, depsOf(current, now, hasUnsuccessfulAttempt(current)));
    if (issues.length > 0) return { status: "invalid", issues };

    try {
      let expectedVersion = target.version;
      if (inline && values.occurredAt !== null && values.inlineMethod !== null) {
        const attempt = await repo.updateFollowUp(
          toAttemptCall(
            {
              attemptedAt: values.occurredAt,
              method: values.inlineMethod,
              result: "not_reached",
              note: "",
            },
            target,
          ),
          attemptKey,
        );
        expectedVersion = attempt.entityVersion;
      }
      const result = await repo.updateFollowUp(
        toOutcomeCall(values, target.id, expectedVersion),
        key,
      );
      return { status: "saved", followUp: result.data, replayed: result.replayed };
    } catch (error) {
      return mapWriteError(error);
    }
  });
}

function depsOf(current: FollowUp, now: Date, unsuccessful: boolean) {
  return { now: () => now, createdAt: current.createdAt, hasUnsuccessfulAttempt: unsuccessful };
}
