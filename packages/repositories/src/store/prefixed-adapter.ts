/**
 * A view of a store under the `remote_*` collections (and `remote.` meta keys). The simulated
 * remote (FND-07 task 8) runs the same repository engine over this view, so its authoritative
 * copy lives in the SAME database file as the device data (no second DB, HWM-02).
 */
import {
  isLocalCollectionName,
  LOCAL_COLLECTIONS,
  REMOTE_PREFIX,
  remoteCollection,
  type CollectionName,
} from "./collections.ts";
import type { StoreAdapter } from "./store-adapter.ts";

export const REMOTE_META_PREFIX = "remote." as const;

function mapCollection(c: CollectionName): CollectionName {
  if (!isLocalCollectionName(c)) {
    throw new RangeError(`remote view: ${c} is not a local collection name`);
  }
  return remoteCollection(c);
}

/** `clearAll` on the view clears only the `remote_*` collections and `remote.` meta keys. */
export function createRemoteStoreView(
  base: StoreAdapter,
  listMetaKeys: () => readonly string[] = () => [],
): StoreAdapter {
  const wrap = (s: StoreAdapter): StoreAdapter => {
    const view: StoreAdapter = {
      get: (c, id) => s.get(mapCollection(c), id),
      getAll: (c) => s.getAll(mapCollection(c)),
      put: (c, v) => s.put(mapCollection(c), v),
      bulkPut: (c, vs) => s.bulkPut(mapCollection(c), vs),
      delete: (c, id) => s.delete(mapCollection(c), id),
      async clearAll() {
        // Remote-only clear: delete every document of every remote_* collection.
        for (const name of LOCAL_COLLECTIONS) {
          const target = remoteCollection(name);
          for (const row of await s.getAll<{ id: string }>(target)) await s.delete(target, row.id);
        }
        for (const key of listMetaKeys()) await s.setMeta(`${REMOTE_META_PREFIX}${key}`, "");
      },
      transaction: (fn) => s.transaction((tx) => fn(wrap(tx))),
      getMeta: (key) => s.getMeta(`${REMOTE_META_PREFIX}${key}`),
      setMeta: (key, v) => s.setMeta(`${REMOTE_META_PREFIX}${key}`, v),
    };
    return view;
  };
  return wrap(base);
}

export const isRemoteCollection = (c: string): boolean => c.startsWith(REMOTE_PREFIX);
