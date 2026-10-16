import type { SyncOpStatus } from "../enums.ts";
import { defineMachine } from "./define-machine.ts";

/**
 * The only sync design (HWM-02/09/10 consume it; FND-07 drives it).
 *
 * - queued → sending → acknowledged | retryable_failure | conflict | rejected
 * - retryable_failure → queued (backoff)
 * - conflict → needs_resolution → superseded. Resolution `reapply_on_latest` also enqueues a
 *   NEW op (with `resolvesOpId` and a new idempotency key); `keep_latest` refreshes the local
 *   entity from the server snapshot.
 * - queued | retryable_failure → blocked_revoked → queued (device revocation / restore, HWM-10)
 * - `acknowledged`, `rejected` (VALIDATION_ERROR / FORBIDDEN) and `superseded` are terminal.
 *   No transition deletes an op.
 */
export const syncOperationMachine = defineMachine<SyncOpStatus>("sync_operation", {
  queued: ["sending", "blocked_revoked"],
  sending: ["acknowledged", "retryable_failure", "conflict", "rejected"],
  acknowledged: [],
  retryable_failure: ["queued", "blocked_revoked"],
  conflict: ["needs_resolution"],
  needs_resolution: ["superseded"],
  rejected: [],
  superseded: [],
  blocked_revoked: ["queued"],
});
