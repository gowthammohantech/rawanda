/**
 * `createDexieStoreAdapter({ dbName })` — IndexedDB persistence for the web apps and the Expo web
 * target (FND-08 task 1). Import from `@laif/repositories/dexie` only, so native bundles never
 * pull Dexie.
 *
 * Schema v1: one table per `COLLECTIONS` entry (local + `remote_*`) with
 * `'id, patientId, facilityId, status, updatedAt'` (indexes reserved for future use; filtering
 * still happens in JS) plus `meta: 'key'`. New collections go into the registry with a Dexie
 * version bump in the same commit; apps never declare tables.
 *
 * `transaction(fn)` is one `rw` IndexedDB transaction over every table, so it is all-or-nothing
 * and serialised by IndexedDB itself. Inside it only `tx` methods may be awaited (clock and id
 * generator are synchronous). Storage failures (`VersionError`, `QuotaExceededError`, closed /
 * blocked database, …) become `RepositoryError('DEPENDENCY_UNAVAILABLE')`.
 */
import Dexie, { type DexieOptions, type Table, type Transaction } from "dexie";

import { assertCollection, assertId, assertMetaValue, jsonCopy } from "./adapter-utils.ts";
import { COLLECTIONS, type CollectionName } from "./collections.ts";
import { runMappedTransaction, toStorageError } from "./storage-errors.ts";
import type { StoreAdapter } from "./store-adapter.ts";

export { dexieDbName } from "./db-names.ts";

export const DEXIE_SCHEMA_VERSION = 1;
/** Index spec of every collection table (primary key `id`). */
export const DEXIE_COLLECTION_SCHEMA = "id, patientId, facilityId, status, updatedAt";
export const DEXIE_META_TABLE = "meta";

type MetaRow = { key: string; value: string };
type Doc = { id: string };

export type DexieStoreAdapterOptions = {
  /** `laif-clinical`, `laif-admin`, `laif-worker`, `laif-citizen` (see `dexieDbName`). */
  dbName: string;
  /** Injected IndexedDB implementation (tests: `fake-indexeddb`); default: the global one. */
  indexedDB?: DexieOptions["indexedDB"];
  IDBKeyRange?: DexieOptions["IDBKeyRange"];
};

export type DexieStoreAdapter = StoreAdapter & {
  readonly db: Dexie;
  readonly dbName: string;
  /** Closes the connection (a later `createDexieStoreAdapter` with the same name reopens it). */
  close(): void;
  /** Deletes the whole database (tests / "forget this device"). */
  deleteDatabase(): Promise<void>;
};

/** The Dexie `stores()` map of schema v1. */
export function dexieSchema(): Record<string, string> {
  const schema: Record<string, string> = {};
  for (const c of COLLECTIONS) schema[c] = DEXIE_COLLECTION_SCHEMA;
  schema[DEXIE_META_TABLE] = "key";
  return schema;
}

/** Turns a sync throw into a rejection and maps rejections of `op` to storage errors. */
async function guarded<T>(validate: () => void, op: () => PromiseLike<T>): Promise<T> {
  validate();
  try {
    return await op();
  } catch (error) {
    throw toStorageError("dexie", error);
  }
}

export function createDexieStoreAdapter(options: DexieStoreAdapterOptions): DexieStoreAdapter {
  const dexieOptions: DexieOptions = {};
  if (options.indexedDB) dexieOptions.indexedDB = options.indexedDB;
  if (options.IDBKeyRange) dexieOptions.IDBKeyRange = options.IDBKeyRange;
  const db = new Dexie(options.dbName, dexieOptions);
  db.version(DEXIE_SCHEMA_VERSION).stores(dexieSchema());

  const tableNames = [...COLLECTIONS, DEXIE_META_TABLE];

  function txAdapter(trans: Transaction): StoreAdapter {
    const table = (c: CollectionName): Table<Doc, string> => trans.table<Doc, string>(c);
    const meta = (): Table<MetaRow, string> => trans.table<MetaRow, string>(DEXIE_META_TABLE);
    const tx: StoreAdapter = {
      get<T>(c: CollectionName, id: string): Promise<T | undefined> {
        return guarded(
          () => assertCollection(c),
          async () => (await table(c).get(id)) as T | undefined,
        );
      },
      getAll<T>(c: CollectionName): Promise<T[]> {
        // Primary-key order = `id` ascending (IndexedDB compares strings by code unit).
        return guarded(
          () => assertCollection(c),
          async () => (await table(c).toArray()) as unknown as T[],
        );
      },
      put<T extends { id: string }>(c: CollectionName, v: T): Promise<void> {
        return guarded(
          () => {
            assertCollection(c);
            assertId(v);
          },
          async () => {
            await table(c).put(jsonCopy(v));
          },
        );
      },
      bulkPut<T extends { id: string }>(c: CollectionName, vs: T[]): Promise<void> {
        return guarded(
          () => {
            assertCollection(c);
            for (const v of vs) assertId(v);
          },
          async () => {
            if (vs.length > 0) await table(c).bulkPut(vs.map(jsonCopy));
          },
        );
      },
      delete(c: CollectionName, id: string): Promise<void> {
        return guarded(
          () => assertCollection(c),
          () => table(c).delete(id),
        );
      },
      clearAll(): Promise<void> {
        return guarded(
          () => undefined,
          async () => {
            await Promise.all(tableNames.map((name) => trans.table(name).clear()));
          },
        );
      },
      transaction<R>(fn: (inner: StoreAdapter) => Promise<R>): Promise<R> {
        return fn(tx);
      },
      async getMeta(key: string): Promise<string | undefined> {
        const row = await guarded(
          () => undefined,
          () => meta().get(key),
        );
        return row?.value;
      },
      setMeta(key: string, v: string): Promise<void> {
        return guarded(
          () => assertMetaValue(v),
          async () => {
            await meta().put({ key, value: v });
          },
        );
      },
    };
    return tx;
  }

  function run<R>(mode: "r" | "rw", fn: (tx: StoreAdapter) => Promise<R>): Promise<R> {
    return runMappedTransaction<Transaction, R>(
      "dexie",
      (body) => db.transaction(mode, tableNames, (trans) => body(trans)),
      (trans) => fn(txAdapter(trans)),
    );
  }

  const transaction = <R>(fn: (tx: StoreAdapter) => Promise<R>): Promise<R> => run("rw", fn);
  /** Reads outside a transaction use a short read-only transaction. */
  const read = <R>(fn: (tx: StoreAdapter) => Promise<R>): Promise<R> => run("r", fn);

  return {
    db,
    dbName: options.dbName,
    get: (c, id) => read((tx) => tx.get(c, id)),
    getAll: (c) => read((tx) => tx.getAll(c)),
    put: (c, v) => transaction((tx) => tx.put(c, v)),
    bulkPut: (c, vs) => transaction((tx) => tx.bulkPut(c, vs)),
    delete: (c, id) => transaction((tx) => tx.delete(c, id)),
    clearAll: () => transaction((tx) => tx.clearAll()),
    transaction,
    getMeta: (key) => read((tx) => tx.getMeta(key)),
    setMeta: (key, v) => transaction((tx) => tx.setMeta(key, v)),
    close: () => db.close(),
    async deleteDatabase() {
      try {
        await db.delete();
      } catch (error) {
        throw toStorageError("dexie", error);
      }
    },
  };
}
