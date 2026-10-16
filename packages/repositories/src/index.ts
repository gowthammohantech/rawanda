/**
 * @laif/repositories — the storage-agnostic `CareRepository` (FND-07): write pipeline with
 * audit, idempotency and optimistic versions, simulated transport faults, the sync queue against
 * an in-app simulated remote, demo reset / scenarios, the collection registry and the document
 * store abstraction (in-memory adapter here).
 *
 * Platform entries (FND-08) are separate so bundles never pull the other platform's modules:
 * `@laif/repositories/dexie` (web IndexedDB), `/sqlite` (SQLite adapter over a `SqlExecutor`),
 * `/expo-sqlite` (device executor, optional peer `expo-sqlite`), `/ids/web`, `/ids/native`
 * (optional peer `expo-crypto`). This root entry imports none of them.
 *
 * The contract suite (Vitest) is exported from `@laif/repositories/contract-suite`.
 */
export const PACKAGE = "@laif/repositories" as const;

export * from "./care-repository.ts";
export { createCareRepository } from "./create-care-repository.ts";
export * from "./errors.ts";
export * from "./idempotency.ts";
export * from "./query-keys.ts";
export * from "./seed-records.ts";
export * from "./audit/actions.ts";
export { buildAuditEvent, emitAudit, type AuditEventInput } from "./audit/emit.ts";
export * from "./store/collections.ts";
export type { StoreAdapter, StoreAdapterFactory } from "./store/store-adapter.ts";
export { createMemoryStoreAdapter, type MemoryStoreAdapter } from "./store/memory-adapter.ts";
export { createRemoteStoreView, REMOTE_META_PREFIX } from "./store/prefixed-adapter.ts";
export type { SqlBindValue, SqlExecutor } from "./store/sql-executor.ts";
export { dexieDbName, sqliteDbFileName } from "./store/db-names.ts";
export {
  isStorageUnavailableError,
  STORAGE_UNAVAILABLE_MESSAGE_KEY,
  toStorageError,
  type StorageEngine,
} from "./store/storage-errors.ts";
export * from "./transport/faults.ts";
export * from "./transport/simulated.ts";
export {
  backoffMs,
  createSyncQueue,
  LOCAL_SEQ_META_KEY,
  SYNC_BACKOFF_BASE_MS,
  SYNC_BACKOFF_JITTER,
  SYNC_BACKOFF_MAX_MS,
  SYNC_MAX_AUTO_ATTEMPTS,
  type SyncQueue,
} from "./sync/sync-queue.ts";
export { createSimulatedRemote, type SimulatedRemote } from "./sync/simulated-remote.ts";
export { META_KEYS } from "./services/demo.ts";
export { activeRuleset } from "./services/screenings.ts";
export { PATIENT_MATCH_MIN_SCORE } from "./services/patients.ts";
export { Engine, TxContext, type EngineMode, type MutationSpec } from "./core/engine.ts";
