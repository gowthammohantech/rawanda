/**
 * Node-side `SqlExecutor` over better-sqlite3 (FND-08 task 4): the SQLite adapter's SQL runs for
 * real under Vitest. In-memory by default; pass a file path for restart tests. App tracks use the
 * same shim from `@laif/test-utils/sqlite` (`createTestSqliteExecutor`).
 */
import Database from "better-sqlite3";

import type { SqlBindValue, SqlExecutor } from "../src/store/sql-executor.ts";

export type BetterSqliteExecutor = SqlExecutor & {
  readonly db: Database.Database;
  closeAsync(): Promise<void>;
};

type NodeBindValue = string | number | null | Buffer;

const bind = (params: SqlBindValue[]): NodeBindValue[] =>
  params.map((p) =>
    typeof p === "boolean" ? (p ? 1 : 0) : p instanceof Uint8Array ? Buffer.from(p) : p,
  );

export function createBetterSqliteExecutor(filename = ":memory:"): BetterSqliteExecutor {
  const db = new Database(filename);
  let chain: Promise<unknown> = Promise.resolve();

  const executor: BetterSqliteExecutor = {
    db,
    execAsync(source) {
      return new Promise<void>((resolve) => {
        db.exec(source);
        resolve();
      });
    },
    runAsync(source, params) {
      return Promise.resolve().then(() => db.prepare(source).run(...bind(params)));
    },
    getAllAsync<T>(source: string, params: SqlBindValue[]) {
      return Promise.resolve().then(() => db.prepare(source).all(...bind(params)) as T[]);
    },
    getFirstAsync<T>(source: string, params: SqlBindValue[]) {
      return Promise.resolve().then(
        () => (db.prepare(source).get(...bind(params)) as T | undefined) ?? null,
      );
    },
    withExclusiveTransactionAsync(task) {
      // expo-sqlite serialises exclusive transactions; emulate that on the single connection.
      const run = chain.then(async () => {
        db.exec("BEGIN EXCLUSIVE");
        try {
          await task(executor);
          db.exec("COMMIT");
        } catch (error) {
          if (db.inTransaction) db.exec("ROLLBACK");
          throw error;
        }
      });
      chain = run.catch(() => undefined);
      return run;
    },
    closeAsync() {
      return Promise.resolve().then(() => {
        if (db.open) db.close();
      });
    },
  };
  return executor;
}
