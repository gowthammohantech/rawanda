/**
 * Retry schedule as the worker sees it (HWM-09 task 1). The backoff itself is FND-07
 * (`min(60 s, 2 s·2^(attempt−1)) ± 20 %`, seeded jitter, 8 automatic attempts, never deleted or
 * downgraded) — this module only turns an op's `nextAttemptAt` into "Retrying in 8s" /
 * "Retry now", and finds the earliest due retry for the foreground timer (`triggers.ts`).
 * "Now" is always the repository's demo clock (never device time).
 */
import type { SyncOperation } from "@laif/domain";
import { SYNC_MAX_AUTO_ATTEMPTS } from "@laif/repositories";

export {
  backoffMs,
  SYNC_BACKOFF_BASE_MS,
  SYNC_BACKOFF_JITTER,
  SYNC_BACKOFF_MAX_MS,
  SYNC_MAX_AUTO_ATTEMPTS,
} from "@laif/repositories";

type RetryOp = Pick<SyncOperation, "status" | "attempts" | "nextAttemptAt">;

export type RetryView =
  /** Not a failed op (queued / sending / settled). */
  | { kind: "none" }
  /** Failed; the next automatic attempt is in `seconds` (rounded up, ≥ 1). */
  | { kind: "scheduled"; seconds: number }
  /** Failed and due: the next sync run sends it. */
  | { kind: "due" }
  /** Automatic retries exhausted (8 attempts): only "Retry now" sends it again. */
  | { kind: "manual" };

export function autoRetryExhausted(op: Pick<SyncOperation, "attempts">): boolean {
  return op.attempts >= SYNC_MAX_AUTO_ATTEMPTS;
}

export function retryView(op: RetryOp, nowMs: number): RetryView {
  if (op.status !== "retryable_failure") return { kind: "none" };
  if (autoRetryExhausted(op)) return { kind: "manual" };
  if (op.nextAttemptAt === null) return { kind: "due" };
  const delay = Date.parse(op.nextAttemptAt) - nowMs;
  if (delay <= 0) return { kind: "due" };
  return { kind: "scheduled", seconds: Math.max(1, Math.ceil(delay / 1000)) };
}

/** "Retry now" is offered for failed ops (always allowed by FND-07 `sync.retryNow`). */
export const canRetryNow = (op: Pick<SyncOperation, "status">): boolean =>
  op.status === "retryable_failure";

/**
 * Milliseconds until the earliest automatic retry among `ops` (0 when one is already due),
 * or null when nothing will retry by itself.
 */
export function nextRetryDelayMs(ops: readonly RetryOp[], nowMs: number): number | null {
  let earliest: number | null = null;
  for (const op of ops) {
    if (op.status !== "retryable_failure" || autoRetryExhausted(op)) continue;
    const at = op.nextAttemptAt === null ? nowMs : Date.parse(op.nextAttemptAt);
    const delay = Math.max(0, at - nowMs);
    if (earliest === null || delay < earliest) earliest = delay;
  }
  return earliest;
}
