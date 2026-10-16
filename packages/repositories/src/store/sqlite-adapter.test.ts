import { describe, expect, it } from "vitest";

import { createBetterSqliteExecutor } from "../../test/better-sqlite-executor.ts";
import { runStoreAdapterContract } from "./contract-suite.ts";
import type { SqlExecutor } from "./sql-executor.ts";
import {
  createSqliteStoreAdapter,
  SQLITE_SCHEMA_VERSION,
  sqliteDbFileName,
} from "./sqlite-adapter.ts";

runStoreAdapterContract("sqlite (better-sqlite3)", () =>
  createSqliteStoreAdapter(createBetterSqliteExecutor()),
);

describe("sqlite adapter specifics", () => {
  it("names one database file per app: laif-<appId>.db", () => {
    expect(sqliteDbFileName("worker")).toBe("laif-worker.db");
    expect(sqliteDbFileName("citizen")).toBe("laif-citizen.db");
  });

  it("creates only the records + meta tables and owns PRAGMA user_version", async () => {
    const executor = createBetterSqliteExecutor();
    const store = createSqliteStoreAdapter(executor);
    await store.put("patients", { id: "p1", updatedAt: "2026-10-14T06:00:00.000Z" });
    await store.put("remote_patients", { id: "p1" });
    const tables = executor.db
      .prepare("SELECT name FROM sqlite_master WHERE type = 'table' ORDER BY name")
      .all() as { name: string }[];
    expect(tables.map((t) => t.name)).toEqual(["meta", "records"]);
    expect(executor.db.pragma("user_version", { simple: true })).toBe(SQLITE_SCHEMA_VERSION);
    const rows = executor.db
      .prepare("SELECT collection, id, updated_at FROM records ORDER BY collection")
      .all();
    expect(rows).toEqual([
      { collection: "patients", id: "p1", updated_at: "2026-10-14T06:00:00.000Z" },
      { collection: "remote_patients", id: "p1", updated_at: "" },
    ]);
  });

  it("rejects unknown collections, documents without an id and non-string meta", async () => {
    const store = createSqliteStoreAdapter(createBetterSqliteExecutor());
    await expect(store.get("nope" as never, "x")).rejects.toThrow(/unknown collection/);
    await expect(store.put("patients", { id: "" })).rejects.toThrow(/non-empty string id/);
    await expect(store.setMeta("k", 1 as never)).rejects.toThrow(/strings/);
  });

  it("a database written by a newer schema surfaces as DEPENDENCY_UNAVAILABLE", async () => {
    const executor = createBetterSqliteExecutor();
    executor.db.pragma(`user_version = ${SQLITE_SCHEMA_VERSION + 1}`);
    const store = createSqliteStoreAdapter(executor);
    await expect(store.get("patients", "x")).rejects.toMatchObject({
      code: "DEPENDENCY_UNAVAILABLE",
      details: { storage: "sqlite", errorName: "VersionError" },
    });
  });

  it("an executor failure (disk full) surfaces as DEPENDENCY_UNAVAILABLE and rolls back", async () => {
    const real = createBetterSqliteExecutor();
    let failWrites = false;
    const wrap = (inner: SqlExecutor): SqlExecutor => ({
      execAsync: (s) => inner.execAsync(s),
      runAsync: (s, p) => {
        if (failWrites && p[0] === "screenings") {
          const error = new Error("database or disk is full");
          error.name = "SQLITE_FULL";
          return Promise.reject(error);
        }
        return inner.runAsync(s, p);
      },
      getAllAsync: (s, p) => inner.getAllAsync(s, p),
      getFirstAsync: (s, p) => inner.getFirstAsync(s, p),
      withExclusiveTransactionAsync: (task) =>
        inner.withExclusiveTransactionAsync((txn) => task(wrap(txn))),
    });
    const store = createSqliteStoreAdapter(wrap(real));
    await store.put("patients", { id: "keep" });
    failWrites = true;
    await expect(
      store.transaction(async (tx) => {
        await tx.put("patients", { id: "partial" });
        await tx.put("screenings", { id: "s1" });
      }),
    ).rejects.toMatchObject({
      code: "DEPENDENCY_UNAVAILABLE",
      details: { errorName: "SQLITE_FULL", messageKey: "common:error.storageUnavailable" },
    });
    expect(await store.get("patients", "partial")).toBeUndefined();
    expect(await store.get("patients", "keep")).toBeDefined();
  });

  it("errors thrown by the transaction callback propagate unchanged", async () => {
    const store = createSqliteStoreAdapter(createBetterSqliteExecutor());
    const boom = new TypeError("mine");
    await expect(store.transaction(() => Promise.reject(boom))).rejects.toBe(boom);
  });

  it("close() waits for queued transactions", async () => {
    const executor = createBetterSqliteExecutor();
    const store = createSqliteStoreAdapter(executor);
    const pending = store.put("patients", { id: "late" });
    await store.close();
    await pending;
    expect(executor.db.open).toBe(false);
  });
});
