/**
 * `openExpoSqliteExecutor(name)` — the device `SqlExecutor` over expo-sqlite (FND-08 task 3).
 * Import from `@laif/repositories/expo-sqlite` only: `expo-sqlite` is an optional peer dependency
 * and never reaches web bundles or the root entry.
 *
 * Usage (FND-11 native shells): `createSqliteStoreAdapter(await openExpoSqliteExecutor(
 * sqliteDbFileName('worker')))` — one database file per app, `laif-<appId>.db`.
 */
import * as SQLite from "expo-sqlite";

import type { SqlBindValue, SqlExecutor } from "./sql-executor.ts";

export { sqliteDbFileName } from "./db-names.ts";

/** Adapts an expo-sqlite database (or its exclusive-transaction handle) to `SqlExecutor`. */
export function expoSqliteExecutor(db: SQLite.SQLiteDatabase): SqlExecutor {
  return {
    execAsync: (source) => db.execAsync(source),
    runAsync: (source, params: SqlBindValue[]) => db.runAsync(source, params),
    getAllAsync: <T>(source: string, params: SqlBindValue[]) => db.getAllAsync<T>(source, params),
    getFirstAsync: <T>(source: string, params: SqlBindValue[]) =>
      db.getFirstAsync<T>(source, params),
    withExclusiveTransactionAsync: (task) =>
      db.withExclusiveTransactionAsync((txn) => task(expoSqliteExecutor(txn))),
    closeAsync: () => db.closeAsync(),
  };
}

/** Opens (creating if needed) `name`, e.g. `laif-worker.db`. */
export async function openExpoSqliteExecutor(name: string): Promise<SqlExecutor> {
  return expoSqliteExecutor(await SQLite.openDatabaseAsync(name));
}
