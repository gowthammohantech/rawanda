/**
 * Adapter fixtures for the persistence tests: every factory returns a fresh, empty store and a
 * `reopen()` that closes it and opens a new adapter over the same database (reload / app
 * restart). Dexie runs on fake-indexeddb, SQLite on a better-sqlite3 temp file.
 */
import "fake-indexeddb/auto";

import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { createDexieStoreAdapter } from "../src/store/dexie-adapter.ts";
import { createMemoryStoreAdapter } from "../src/store/memory-adapter.ts";
import { createSqliteStoreAdapter } from "../src/store/sqlite-adapter.ts";
import type { StoreAdapter } from "../src/store/store-adapter.ts";
import { createBetterSqliteExecutor } from "./better-sqlite-executor.ts";

export type ReopenableStore = {
  store: StoreAdapter;
  /** Closes the current adapter and returns a new one over the same database. */
  reopen(): Promise<StoreAdapter>;
  dispose(): Promise<void>;
};

export type AdapterKind = "memory" | "dexie" | "sqlite";

let n = 0;

export function openDexie(): ReopenableStore {
  const dbName = `laif-test-reopen-${++n}`;
  let current = createDexieStoreAdapter({ dbName });
  return {
    get store() {
      return current;
    },
    reopen() {
      current.close();
      current = createDexieStoreAdapter({ dbName });
      return Promise.resolve(current);
    },
    dispose: () => current.deleteDatabase(),
  };
}

export function openSqliteFile(): ReopenableStore {
  const dir = mkdtempSync(join(tmpdir(), "laif-sqlite-"));
  const file = join(dir, "laif-worker.db");
  let current = createSqliteStoreAdapter(createBetterSqliteExecutor(file));
  return {
    get store() {
      return current;
    },
    async reopen() {
      await current.close();
      current = createSqliteStoreAdapter(createBetterSqliteExecutor(file));
      return current;
    },
    async dispose() {
      await current.close();
      rmSync(dir, { recursive: true, force: true });
    },
  };
}

/** Fresh store per call (matrix tests). */
export const STORE_FACTORIES: Record<AdapterKind, () => StoreAdapter> = {
  memory: () => createMemoryStoreAdapter(),
  dexie: () => createDexieStoreAdapter({ dbName: `laif-test-matrix-${++n}` }),
  sqlite: () => createSqliteStoreAdapter(createBetterSqliteExecutor()),
};
