/**
 * `@laif/test-utils/sqlite` — the Node SQLite shim app tracks use (FND-08 task 8): a
 * better-sqlite3 `SqlExecutor`, so `createSqliteStoreAdapter` runs its real SQL under Vitest.
 * There is no jest-expo shim; native tests run under Vitest (FND-10).
 *
 *   const store = createSqliteStoreAdapter(createTestSqliteExecutor());          // in memory
 *   const store = createSqliteStoreAdapter(createTestSqliteExecutor(filePath));  // restart tests
 */
import type { SqlBindValue, SqlExecutor } from "@laif/repositories";
import Database from "better-sqlite3";

export type TestSqliteExecutor = SqlExecutor & {
  /** The underlying better-sqlite3 connection (inspect tables / pragmas in tests). */
  readonly db: Database.Database;
  closeAsync(): Promise<void>;
};

type NodeBindValue = string | number | null | Buffer;

const bind = (params: SqlBindValue[]): NodeBindValue[] =>
  params.map((p) =>
    typeof p === "boolean" ? (p ? 1 : 0) : p instanceof Uint8Array ? Buffer.from(p) : p,
  );

export function createTestSqliteExecutor(filename = ":memory:"): TestSqliteExecutor {
  const db = new Database(filename);
  let chain: Promise<unknown> = Promise.resolve();

  const executor: TestSqliteExecutor = {
    db,
    execAsync: (source) => Promise.resolve().then(() => void db.exec(source)),
    runAsync: (source, params) =>
      Promise.resolve().then(() => db.prepare(source).run(...bind(params))),
    getAllAsync: <T>(source: string, params: SqlBindValue[]) =>
      Promise.resolve().then(() => db.prepare(source).all(...bind(params)) as T[]),
    getFirstAsync: <T>(source: string, params: SqlBindValue[]) =>
      Promise.resolve().then(
        () => (db.prepare(source).get(...bind(params)) as T | undefined) ?? null,
      ),
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
    closeAsync: () =>
      Promise.resolve().then(() => {
        if (db.open) db.close();
      }),
  };
  return executor;
}
