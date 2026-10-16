import type { EntityType, SyncOpStatus, SyncOpType } from "../enums.ts";
import type { CorrelationId, SyncOperationId } from "../ids.ts";
import type { IsoUtc, JsonValue, PersistedEntity } from "./base.ts";

export type SyncOperationError = {
  /** FND-03 error code (e.g. `CONFLICT`, `VALIDATION_ERROR`, `TIMEOUT`). */
  code: string;
  reason: string | null;
};

/** One queued offline mutation (the only sync design; FND-07, HWM-02/09/10). */
export type SyncOperation = PersistedEntity & {
  id: SyncOperationId;
  clientMutationId: string;
  idempotencyKey: string;
  localSeq: number;
  entityType: EntityType;
  entityId: string;
  opType: SyncOpType;
  payload: JsonValue;
  baseVersion: number | null;
  dependsOnOpId: SyncOperationId | null;
  /** Set on the new op created by a `reapply_on_latest` resolution. */
  resolvesOpId: SyncOperationId | null;
  status: SyncOpStatus;
  attempts: number;
  nextAttemptAt: IsoUtc | null;
  lastError: SyncOperationError | null;
  deviceTimestamp: IsoUtc;
  serverSnapshot: JsonValue | null;
  correlationId: CorrelationId;
};
