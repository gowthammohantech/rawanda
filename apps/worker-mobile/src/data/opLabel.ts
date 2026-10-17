/**
 * Op labels used by this track (HWM-02 task 3). FND-07 `SyncOperation`s carry
 * `entityType` + `opType` (`create` / `update` / `command`) — there is no `opType` like
 * `screening.submit`. The worker app derives the phase's names from `entityType`, `opType` and
 * the FND-03 payload's `action`:
 *
 * | entityType : opType          | payload.action   | label               |
 * |------------------------------|------------------|---------------------|
 * | patient : create             | —                | `patient.register`  |
 * | screening : create           | —                | `screening.submit`  |
 * | screening : update           | —                | `screening.amend`   |
 * | follow_up : update           | `record_attempt` | `followup.attempt`  |
 * | follow_up : update           | `record_outcome` | `followup.outcome`  |
 * | follow_up : update           | other            | `followup.update`   |
 * | care_task : create           | (`targetType`)   | `correction.request`|
 * | anything else                |                  | `other`             |
 *
 * A resolution op created by `sync.resolveConflict` keeps the original op's entity / type and
 * has `resolvesOpId` set (`resolution: true`).
 */
import type { SyncOperation } from "@laif/domain";

export const SYNC_OP_LABELS = [
  "patient.register",
  "screening.submit",
  "screening.amend",
  "followup.attempt",
  "followup.outcome",
  "followup.update",
  "correction.request",
  "other",
] as const;
export type SyncOpLabel = (typeof SYNC_OP_LABELS)[number];

export type SyncOpDescription = { label: SyncOpLabel; resolution: boolean };

type OpLike = Pick<SyncOperation, "entityType" | "opType" | "payload" | "resolvesOpId">;

function payloadField(op: OpLike, field: string): unknown {
  const payload = op.payload;
  if (payload === null || typeof payload !== "object" || Array.isArray(payload)) return undefined;
  return (payload as Record<string, unknown>)[field];
}

export function syncOpLabel(op: OpLike): SyncOpLabel {
  switch (`${op.entityType}:${op.opType}`) {
    case "patient:create":
      return "patient.register";
    case "screening:create":
      return "screening.submit";
    case "screening:update":
      return "screening.amend";
    case "follow_up:update": {
      const action = payloadField(op, "action");
      if (action === "record_attempt") return "followup.attempt";
      if (action === "record_outcome") return "followup.outcome";
      return "followup.update";
    }
    case "care_task:create":
      return payloadField(op, "targetType") === undefined ? "other" : "correction.request";
    default:
      return "other";
  }
}

export function describeSyncOp(op: OpLike): SyncOpDescription {
  return { label: syncOpLabel(op), resolution: op.resolvesOpId !== null };
}

/** `worker:sync.op.<label>` translation key. */
export const syncOpLabelKey = (label: SyncOpLabel) => `worker:sync.op.${label}` as const;
