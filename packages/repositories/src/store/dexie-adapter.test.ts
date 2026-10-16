import "fake-indexeddb/auto";

import Dexie from "dexie";
import { describe, expect, it, vi } from "vitest";

import { COLLECTIONS } from "./collections.ts";
import { runStoreAdapterContract } from "./contract-suite.ts";
import {
  createDexieStoreAdapter,
  DEXIE_COLLECTION_SCHEMA,
  DEXIE_SCHEMA_VERSION,
  dexieDbName,
} from "./dexie-adapter.ts";
import { isStorageUnavailableError, STORAGE_UNAVAILABLE_MESSAGE_KEY } from "./storage-errors.ts";

let n = 0;
const freshName = (): string => `laif-test-dexie-${++n}`;

runStoreAdapterContract("dexie (fake-indexeddb)", () =>
  createDexieStoreAdapter({ dbName: freshName() }),
);

describe("dexie adapter specifics", () => {
  it("names one database per app: laif-<appId>", () => {
    expect(dexieDbName("clinical")).toBe("laif-clinical");
    expect(dexieDbName("admin")).toBe("laif-admin");
    expect(dexieDbName("worker")).toBe("laif-worker");
    expect(dexieDbName("citizen")).toBe("laif-citizen");
  });

  it("schema v1: one table per registered collection plus meta, with the reserved indexes", async () => {
    const store = createDexieStoreAdapter({ dbName: freshName() });
    await store.db.open();
    expect(store.db.verno).toBe(DEXIE_SCHEMA_VERSION);
    const names = store.db.tables.map((t) => t.name).sort();
    expect(names).toEqual([...COLLECTIONS, "meta"].sort());
    const patients = store.db.table("patients").schema;
    expect(patients.primKey.keyPath).toBe("id");
    expect(patients.indexes.map((i) => i.name).sort()).toEqual(
      DEXIE_COLLECTION_SCHEMA.split(",")
        .map((s) => s.trim())
        .filter((s) => s !== "id")
        .sort(),
    );
    expect(store.db.table("meta").schema.primKey.keyPath).toBe("key");
    store.close();
  });

  it("rejects unknown collections, documents without an id and non-string meta", async () => {
    const store = createDexieStoreAdapter({ dbName: freshName() });
    await expect(store.get("nope" as never, "x")).rejects.toThrow(/unknown collection/);
    await expect(store.put("patients", { id: "" })).rejects.toThrow(/non-empty string id/);
    await expect(store.setMeta("k", 1 as never)).rejects.toThrow(/strings/);
  });

  it("VersionError (blocked / incompatible schema) surfaces as DEPENDENCY_UNAVAILABLE", async () => {
    const store = createDexieStoreAdapter({ dbName: freshName() });
    // Dexie 4 adapts to a higher on-disk version by itself, so the error is simulated here.
    vi.spyOn(store.db, "transaction").mockImplementation(() => {
      throw new Dexie.VersionError("simulated version conflict");
    });
    const error = await store.get("patients", "x").catch((e: unknown) => e);
    expect(error).toMatchObject({
      name: "RepositoryError",
      code: "DEPENDENCY_UNAVAILABLE",
      status: 503,
      details: { storage: "dexie", errorName: "VersionError" },
    });
    expect(isStorageUnavailableError(error)).toBe(true);
    await expect(store.setMeta("k", "v")).rejects.toMatchObject({ code: "DEPENDENCY_UNAVAILABLE" });
  });

  it("a quota failure surfaces as DEPENDENCY_UNAVAILABLE and rolls the transaction back", async () => {
    const store = createDexieStoreAdapter({ dbName: freshName() });
    await store.put("patients", { id: "keep" });
    store.db.table("screenings").hook("creating", () => {
      throw new DOMException("disk full (simulated)", "QuotaExceededError");
    });
    const error = await store
      .transaction(async (tx) => {
        await tx.put("patients", { id: "partial" });
        await tx.put("screenings", { id: "s1" });
      })
      .catch((e: unknown) => e);
    expect(error).toMatchObject({
      code: "DEPENDENCY_UNAVAILABLE",
      details: { messageKey: STORAGE_UNAVAILABLE_MESSAGE_KEY },
    });
    expect(await store.get("patients", "partial")).toBeUndefined();
    expect(await store.get("patients", "keep")).toBeDefined();
  });

  it("errors thrown by the transaction callback propagate unchanged", async () => {
    const store = createDexieStoreAdapter({ dbName: freshName() });
    const boom = new TypeError("mine");
    await expect(store.transaction(() => Promise.reject(boom))).rejects.toBe(boom);
  });
});
