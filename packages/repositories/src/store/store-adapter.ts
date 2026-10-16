/**
 * The document-store abstraction every repository runs on (FND-07 task 1). The dataset is
 * < 5k rows, so filtering happens in JS (decision); adapters only store JSON documents by id.
 *
 * Implementations: `createMemoryStoreAdapter` (here), `createDexieStoreAdapter` and
 * `createSqliteStoreAdapter` (FND-08). All must pass `runStoreAdapterContract`.
 *
 * Contract (binding for FND-08):
 * - Values are JSON documents; adapters store a copy (callers may mutate what they passed / got).
 * - `getAll` returns documents ordered by `id` ascending (code-unit order), for determinism.
 * - `transaction(fn)` is all-or-nothing: if `fn` rejects, no write made through `tx` (records or
 *   meta) is visible afterwards and the rejection propagates. Transactions are serialised (one
 *   at a time); `tx.transaction(fn)` joins the outer transaction. Inside a transaction only
 *   `tx` methods may be awaited (Dexie rule — clock and id generator are synchronous).
 * - Writes made through `tx` are visible to reads through the same `tx` immediately.
 * - `clearAll` removes every document of every collection and every meta key.
 */
import type { CollectionName } from "./collections.ts";

export type { CollectionName } from "./collections.ts";

export interface StoreAdapter {
  get<T>(c: CollectionName, id: string): Promise<T | undefined>;
  getAll<T>(c: CollectionName): Promise<T[]>;
  put<T extends { id: string }>(c: CollectionName, v: T): Promise<void>;
  bulkPut<T extends { id: string }>(c: CollectionName, vs: T[]): Promise<void>;
  delete(c: CollectionName, id: string): Promise<void>;
  clearAll(): Promise<void>;
  /** All-or-nothing; serialised; nested calls join the outer transaction. */
  transaction<R>(fn: (tx: StoreAdapter) => Promise<R>): Promise<R>;
  getMeta(key: string): Promise<string | undefined>;
  setMeta(key: string, v: string): Promise<void>;
}

/** Factory used by the contract suite (each call returns a fresh, empty store). */
export type StoreAdapterFactory = () => StoreAdapter | Promise<StoreAdapter>;
