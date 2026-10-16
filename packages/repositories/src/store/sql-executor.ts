/**
 * `SqlExecutor` — the subset of expo-sqlite's async `SQLiteDatabase` API the SQLite adapter needs
 * (FND-08 task 2). Implementations: `openExpoSqliteExecutor` (`@laif/repositories/expo-sqlite`,
 * device) and `createTestSqliteExecutor` (`@laif/test-utils/sqlite`, better-sqlite3 under Node).
 *
 * Positional `?` parameters only. `withExclusiveTransactionAsync` runs `task` inside one exclusive
 * transaction: committed when `task` resolves, rolled back (and the rejection re-thrown) when it
 * rejects. Inside `task` only `txn` may be used.
 */
export type SqlBindValue = string | number | null | boolean | Uint8Array;

export interface SqlExecutor {
  execAsync(source: string): Promise<void>;
  runAsync(source: string, params: SqlBindValue[]): Promise<unknown>;
  getAllAsync<T>(source: string, params: SqlBindValue[]): Promise<T[]>;
  getFirstAsync<T>(source: string, params: SqlBindValue[]): Promise<T | null>;
  withExclusiveTransactionAsync(task: (txn: SqlExecutor) => Promise<void>): Promise<void>;
  /** Optional: release the connection (adapter `close()`). */
  closeAsync?(): Promise<void>;
}
