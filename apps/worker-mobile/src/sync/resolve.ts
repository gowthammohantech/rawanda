/**
 * Conflict resolution (HWM-09 tasks 7–8, WF-02 step 4). The transaction is FND-07
 * `repo.sync.resolveConflict(opId, 'reapply_on_latest' | 'keep_latest', key, note?)`:
 *
 * - `reapply_on_latest` → the original op is `superseded` and ONE new op is queued with the
 *   original payload, `baseVersion` = the latest server version, `resolvesOpId` = the original
 *   and a NEW idempotency key (a new intent).
 * - `keep_latest` → the original op is `superseded`, the local row becomes the server copy, the
 *   withdrawn payload stays on the superseded op (never deleted), and a resolution notice op
 *   tells the simulated server (no entity change is sent).
 * - Both: audit `sync.conflict_resolved { originalOpId, resolution, newOpId, noticeOpId,
 *   latestVersion }` (+ the optional note as justification); the server mirrors it with the
 *   original op id once it receives the new op / the notice. Then one `after_resolution` run.
 *
 * Re-apply is refused here (and disabled in the UI with the reason) when the latest server state
 * makes the update invalid: the task was completed, reassigned, or already has an outcome.
 */
import type { ConflictResolution, FollowUp, SyncOperation } from "@laif/domain";
import { RepositoryError, type CareRepository, type SyncRun } from "@laif/repositories";

import { syncOpLabel } from "../data/opLabel.ts";

export type ReapplyBlock =
  /** No server copy came back with the conflict: nothing to re-apply on. */
  | "no_latest"
  /** The task is no longer assigned to this worker (or was marked reassigned). */
  | "reassigned"
  /** The task was completed on the server. */
  | "completed"
  /** Someone already recorded an outcome on the server (only for outcome updates). */
  | "outcome_recorded";

type ConflictOp = Pick<
  SyncOperation,
  "entityType" | "opType" | "payload" | "resolvesOpId" | "serverSnapshot"
>;

const asRecord = (value: unknown): Record<string, unknown> | null =>
  value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;

/** Why "Re-apply my update" is not possible for this conflict, or null when it is. */
export function reapplyBlock(op: ConflictOp, actorId: string | null): ReapplyBlock | null {
  const latest = asRecord(op.serverSnapshot);
  if (latest === null) return "no_latest";
  if (op.entityType === "follow_up") {
    const followUp = latest as Partial<FollowUp>;
    if (
      followUp.status === "reassigned" ||
      (followUp.assignedWorkerId !== undefined &&
        actorId !== null &&
        followUp.assignedWorkerId !== actorId)
    ) {
      return "reassigned";
    }
    if (followUp.status === "completed") return "completed";
    if (syncOpLabel(op) === "followup.outcome" && (followUp.outcome ?? null) !== null) {
      return "outcome_recorded";
    }
  }
  return null;
}

export type ResolveConflictResult = {
  resolution: ConflictResolution;
  /** The new op (`reapply_on_latest`) or the superseded original (`keep_latest`). */
  op: SyncOperation;
  replayed: boolean;
};

type ResolveRepo = Pick<CareRepository, "sync">;

/**
 * Resolves one conflict (re-checks the op is still waiting for a decision and, for re-apply,
 * that the latest state allows it). `key` is the confirmation sheet's idempotency key: a double
 * confirm replays instead of resolving twice.
 */
export async function resolveConflict(
  repo: ResolveRepo,
  op: Pick<SyncOperation, "id"> & ConflictOp,
  resolution: ConflictResolution,
  key: string,
  options: { note?: string; actorId: string | null },
): Promise<ResolveConflictResult> {
  if (resolution === "reapply_on_latest") {
    const block = reapplyBlock(op, options.actorId);
    if (block !== null) {
      throw new RepositoryError("VALIDATION_ERROR", {
        reason: "INVALID_TRANSITION",
        details: { reapplyBlock: block },
      });
    }
  }
  const note = options.note?.trim();
  const result = await repo.sync.resolveConflict(
    op.id,
    resolution,
    key,
    note === undefined || note === "" ? undefined : note,
  );
  return { resolution, op: result.data, replayed: result.replayed };
}

/** After a confirmed resolution: one `after_resolution` run when online (FND-07 single-flight). */
export async function syncAfterResolution(
  run: (trigger: "after_resolution") => Promise<{ run: SyncRun }>,
  offline: boolean,
): Promise<SyncRun | null> {
  if (offline) return null;
  try {
    return (await run("after_resolution")).run;
  } catch {
    return null;
  }
}
