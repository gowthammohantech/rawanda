/**
 * `readStoreCollection(store, name)` — every document of a collection, id-ordered, through the
 * `StoreAdapter` (works for memory, Dexie and SQLite alike; replaces the ADM-proposed
 * `readDexieTable`).
 */
import type { CollectionName, StoreAdapter } from "@laif/repositories";

export function readStoreCollection<T = Record<string, unknown>>(
  store: StoreAdapter,
  name: CollectionName,
): Promise<T[]> {
  return store.getAll<T>(name);
}
