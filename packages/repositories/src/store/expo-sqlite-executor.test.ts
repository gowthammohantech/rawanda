/**
 * `openExpoSqliteExecutor` over a mocked expo-sqlite module that delegates to better-sqlite3, so
 * the adapter runs its real SQL through the expo wrapper (method mapping, nested transaction
 * handle, close).
 */
import { describe, expect, it, vi } from "vitest";

import { createBetterSqliteExecutor } from "../../test/better-sqlite-executor.ts";
import type { SqlBindValue } from "./sql-executor.ts";

const opened: string[] = [];
const misuse: string[] = [];
vi.mock("expo-sqlite", () => ({
  openDatabaseAsync: (name: string) => {
    opened.push(name);
    // Like expo-sqlite, the exclusive transaction runs on its own handle (`txn`); the database
    // object itself must not be used while that transaction is open.
    const inner = createBetterSqliteExecutor();
    let inTxn = false;
    const guard =
      <A extends unknown[], R>(method: string, fn: (...args: A) => R) =>
      (...args: A): R => {
        if (inTxn) misuse.push(method);
        return fn(...args);
      };
    return Promise.resolve({
      execAsync: guard("execAsync", (source: string) => inner.execAsync(source)),
      runAsync: guard("runAsync", (source: string, params: SqlBindValue[]) =>
        inner.runAsync(source, params),
      ),
      getAllAsync: guard("getAllAsync", (source: string, params: SqlBindValue[]) =>
        inner.getAllAsync(source, params),
      ),
      getFirstAsync: guard("getFirstAsync", (source: string, params: SqlBindValue[]) =>
        inner.getFirstAsync(source, params),
      ),
      closeAsync: () => inner.closeAsync(),
      withExclusiveTransactionAsync: (task: (txn: unknown) => Promise<void>) =>
        inner.withExclusiveTransactionAsync(async (txn) => {
          inTxn = true;
          try {
            await task(txn);
          } finally {
            inTxn = false;
          }
        }),
    });
  },
}));

describe("expo-sqlite executor", () => {
  it("opens laif-<appId>.db and drives the SQLite adapter", async () => {
    const { openExpoSqliteExecutor, sqliteDbFileName } = await import("./expo-sqlite-executor.ts");
    const { createSqliteStoreAdapter } = await import("./sqlite-adapter.ts");
    const store = createSqliteStoreAdapter(
      await openExpoSqliteExecutor(sqliteDbFileName("worker")),
    );
    expect(opened).toEqual(["laif-worker.db"]);
    await store.transaction(async (tx) => {
      await tx.put("syncOperations", { id: "op-1", localSeq: 1 });
      await tx.setMeta("sync.localSeq", "1");
    });
    await expect(
      store.transaction(async (tx) => {
        await tx.put("syncOperations", { id: "op-2" });
        throw new Error("rollback");
      }),
    ).rejects.toThrow("rollback");
    expect(await store.getAll("syncOperations")).toEqual([{ id: "op-1", localSeq: 1 }]);
    expect(await store.getMeta("sync.localSeq")).toBe("1");
    expect(misuse).toEqual([]); // every statement inside the transaction used the txn handle
    await store.close();
  });
});
