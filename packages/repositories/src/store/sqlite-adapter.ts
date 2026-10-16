/**
 * `createSqliteStoreAdapter(executor)` — SQLite persistence for the Expo apps (FND-08 task 2).
 * Import from `@laif/repositories/sqlite` (no native imports here; the device executor lives in
 * `@laif/repositories/expo-sqlite`).
 *
 * Decision: a single document table with JSON payloads. Every collection (local and `remote_*`)
 * is rows of `records`, so there is **no per-app SQL migration API**; `PRAGMA user_version` is
 * owned by this adapter only.
 *
 * Transactions are serialised by a promise chain and run through `withExclusiveTransactionAsync`,
 * so concurrent `sync.process()` calls cannot interleave. Plain writes are single-write
 * transactions; plain reads go straight to the executor. Storage failures become
 * `RepositoryError('DEPENDENCY_UNAVAILABLE')`.
 */
import {
  assertCollection,
  assertId,
  assertMetaValue,
  byId,
  createSerialQueue,
} from "./adapter-utils.ts";
import type { CollectionName } from "./collections.ts";
import type { SqlExecutor } from "./sql-executor.ts";
import { runMappedTransaction, toStorageError } from "./storage-errors.ts";
import type { StoreAdapter } from "./store-adapter.ts";

export type { SqlBindValue, SqlExecutor } from "./sql-executor.ts";
export { sqliteDbFileName } from "./db-names.ts";

/** Schema version written to `PRAGMA user_version`. */
export const SQLITE_SCHEMA_VERSION = 1;

export const SQLITE_SCHEMA_SQL = `
CREATE TABLE IF NOT EXISTS records (collection TEXT NOT NULL, id TEXT NOT NULL, json TEXT NOT NULL,
  updated_at TEXT NOT NULL, PRIMARY KEY (collection, id));
CREATE INDEX IF NOT EXISTS idx_records_collection ON records(collection);
CREATE TABLE IF NOT EXISTS meta (key TEXT PRIMARY KEY, value TEXT NOT NULL);
`;

export type SqliteStoreAdapter = StoreAdapter & {
  /** Resolves once the schema exists (every method awaits it implicitly). */
  ready(): Promise<void>;
  /** Waits for queued transactions, then closes the executor (when it supports closing). */
  close(): Promise<void>;
};

type JsonRow = { id: string; json: string };

async function sql<T>(op: () => Promise<T>): Promise<T> {
  try {
    return await op();
  } catch (error) {
    throw toStorageError("sqlite", error);
  }
}

function updatedAtOf(v: object): string {
  const value = (v as { updatedAt?: unknown }).updatedAt;
  return typeof value === "string" ? value : "";
}

function txAdapter(db: SqlExecutor): StoreAdapter {
  const putOne = async (c: CollectionName, v: { id: string }): Promise<void> => {
    const id = assertId(v);
    const json = JSON.stringify(v);
    await sql(() =>
      db.runAsync(
        "INSERT OR REPLACE INTO records (collection, id, json, updated_at) VALUES (?, ?, ?, ?)",
        [c, id, json, updatedAtOf(v)],
      ),
    );
  };
  const tx: StoreAdapter = {
    async get<T>(c: CollectionName, id: string): Promise<T | undefined> {
      assertCollection(c);
      const row = await sql(() =>
        db.getFirstAsync<{ json: string }>(
          "SELECT json FROM records WHERE collection = ? AND id = ?",
          [c, id],
        ),
      );
      return row ? (JSON.parse(row.json) as T) : undefined;
    },
    async getAll<T>(c: CollectionName): Promise<T[]> {
      assertCollection(c);
      const rows = await sql(() =>
        db.getAllAsync<JsonRow>("SELECT id, json FROM records WHERE collection = ?", [c]),
      );
      // Sorted in JS: SQLite's BINARY collation compares UTF-8 bytes, the contract wants
      // JS code-unit order.
      return rows.sort((a, b) => byId(a.id, b.id)).map((row) => JSON.parse(row.json) as T);
    },
    async put<T extends { id: string }>(c: CollectionName, v: T): Promise<void> {
      assertCollection(c);
      await putOne(c, v);
    },
    async bulkPut<T extends { id: string }>(c: CollectionName, vs: T[]): Promise<void> {
      assertCollection(c);
      for (const v of vs) assertId(v);
      for (const v of vs) await putOne(c, v);
    },
    async delete(c: CollectionName, id: string): Promise<void> {
      assertCollection(c);
      await sql(() => db.runAsync("DELETE FROM records WHERE collection = ? AND id = ?", [c, id]));
    },
    async clearAll(): Promise<void> {
      await sql(() => db.execAsync("DELETE FROM records; DELETE FROM meta;"));
    },
    transaction<R>(fn: (inner: StoreAdapter) => Promise<R>): Promise<R> {
      return fn(tx);
    },
    async getMeta(key: string): Promise<string | undefined> {
      const row = await sql(() =>
        db.getFirstAsync<{ value: string }>("SELECT value FROM meta WHERE key = ?", [key]),
      );
      return row ? row.value : undefined;
    },
    async setMeta(key: string, v: string): Promise<void> {
      assertMetaValue(v);
      await sql(() =>
        db.runAsync("INSERT OR REPLACE INTO meta (key, value) VALUES (?, ?)", [key, v]),
      );
    },
  };
  return tx;
}

async function migrate(db: SqlExecutor): Promise<void> {
  await db.execAsync(SQLITE_SCHEMA_SQL);
  // In-memory databases answer `memory`; file databases switch to WAL.
  await db.execAsync("PRAGMA journal_mode = WAL;");
  const row = await db.getFirstAsync<{ user_version: number }>("PRAGMA user_version", []);
  const version = row?.user_version ?? 0;
  if (version > SQLITE_SCHEMA_VERSION) {
    const error = new Error(
      `database schema ${version} is newer than supported ${SQLITE_SCHEMA_VERSION}`,
    );
    error.name = "VersionError";
    throw error;
  }
  if (version < SQLITE_SCHEMA_VERSION) {
    await db.execAsync(`PRAGMA user_version = ${SQLITE_SCHEMA_VERSION};`);
  }
}

export function createSqliteStoreAdapter(executor: SqlExecutor): SqliteStoreAdapter {
  const serial = createSerialQueue();
  let readyPromise: Promise<void> | null = null;
  const ready = (): Promise<void> => {
    readyPromise ??= migrate(executor).catch((error: unknown) => {
      readyPromise = null; // a later call may retry (e.g. after the user freed space)
      throw toStorageError("sqlite", error);
    });
    return readyPromise;
  };
  const direct = txAdapter(executor);

  function transaction<R>(fn: (tx: StoreAdapter) => Promise<R>): Promise<R> {
    return serial(async () => {
      await ready();
      return runMappedTransaction<SqlExecutor, R>(
        "sqlite",
        async (body) => {
          let result: { value: R } | null = null;
          await executor.withExclusiveTransactionAsync(async (txn) => {
            result = { value: await body(txn) };
          });
          const done = result as { value: R } | null;
          if (!done) throw new Error("sqlite transaction finished without a result");
          return done.value;
        },
        (txn) => fn(txAdapter(txn)),
      );
    });
  }

  const read = async <R>(fn: (s: StoreAdapter) => Promise<R>): Promise<R> => {
    await ready();
    return fn(direct);
  };

  return {
    ready,
    get: (c, id) => read((s) => s.get(c, id)),
    getAll: (c) => read((s) => s.getAll(c)),
    put: (c, v) => transaction((tx) => tx.put(c, v)),
    bulkPut: (c, vs) => transaction((tx) => tx.bulkPut(c, vs)),
    delete: (c, id) => transaction((tx) => tx.delete(c, id)),
    clearAll: () => transaction((tx) => tx.clearAll()),
    transaction,
    getMeta: (key) => read((s) => s.getMeta(key)),
    setMeta: (key, v) => transaction((tx) => tx.setMeta(key, v)),
    async close() {
      await serial(() => Promise.resolve());
      if (executor.closeAsync) await sql(() => executor.closeAsync!());
    },
  };
}
