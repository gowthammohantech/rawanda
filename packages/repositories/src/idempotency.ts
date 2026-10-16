/**
 * Idempotency records (FRD §6 `Idempotency-Key`, BR-09). One record per key in the
 * `idempotency` collection, written in the same transaction as the change it protects:
 * - same key + same operation + same payload hash → the stored result with `replayed: true`
 *   (no new change event; the caller audits one `sync.duplicate_suppressed`);
 * - same key + different operation or payload → `VALIDATION_ERROR` reason
 *   `IDEMPOTENCY_KEY_REUSED`.
 * A failed write stores nothing (the transaction rolls back), so a retry after an error with
 * the same key runs normally.
 */
import { hashCanonical, type EntityType } from "@laif/domain";
import type { WriteResult } from "@laif/contracts";

import { RepositoryError } from "./errors.ts";
import type { StoreAdapter } from "./store/store-adapter.ts";

export type IdempotencyRecord = {
  /** The idempotency key. */
  id: string;
  opName: string;
  payloadHash: string;
  entityType: EntityType;
  entityId: string;
  result: WriteResult<unknown>;
  createdAt: string;
  synthetic: true;
};

export type IdempotentWrite<T> = {
  result: WriteResult<T>;
  entityType: EntityType;
  entityId: string;
};

/** Hash of the operation input without its idempotency key (key is compared separately). */
export function payloadHashOf(input: unknown): string {
  if (input !== null && typeof input === "object" && !Array.isArray(input)) {
    const rest: Record<string, unknown> = { ...(input as Record<string, unknown>) };
    delete rest["idempotencyKey"];
    return hashCanonical(rest);
  }
  return hashCanonical(input ?? null);
}

export async function findIdempotencyRecord(
  tx: StoreAdapter,
  key: string,
): Promise<IdempotencyRecord | undefined> {
  return tx.get<IdempotencyRecord>("idempotency", key);
}

/**
 * Runs `fn` once per key. `onReplay` runs (inside `tx`) when a matching record is replayed —
 * the repository uses it to append the `sync.duplicate_suppressed` audit event.
 */
export async function withIdempotency<T>(
  tx: StoreAdapter,
  key: string,
  opName: string,
  payloadHash: string,
  fn: () => Promise<IdempotentWrite<T>>,
  options: { now: string; onReplay?: (record: IdempotencyRecord) => Promise<void> },
): Promise<WriteResult<T>> {
  const existing = await findIdempotencyRecord(tx, key);
  if (existing) {
    if (existing.opName !== opName || existing.payloadHash !== payloadHash) {
      throw new RepositoryError("VALIDATION_ERROR", {
        reason: "IDEMPOTENCY_KEY_REUSED",
        details: { opName, storedOpName: existing.opName },
      });
    }
    await options.onReplay?.(existing);
    return { ...(existing.result as WriteResult<T>), replayed: true };
  }
  const write = await fn();
  const record: IdempotencyRecord = {
    id: key,
    opName,
    payloadHash,
    entityType: write.entityType,
    entityId: write.entityId,
    result: JSON.parse(JSON.stringify(write.result)) as WriteResult<unknown>,
    createdAt: options.now,
    synthetic: true,
  };
  await tx.put("idempotency", record);
  return write.result;
}
