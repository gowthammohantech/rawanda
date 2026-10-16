import { describe, expect, it } from "vitest";

import { COLLECTIONS, LOCAL_COLLECTIONS, resolveEntityType } from "./collections.ts";
import { runStoreAdapterContract } from "./contract-suite.ts";
import { createMemoryStoreAdapter } from "./memory-adapter.ts";
import { createRemoteStoreView } from "./prefixed-adapter.ts";

runStoreAdapterContract("memory", () => createMemoryStoreAdapter());

describe("memory adapter specifics", () => {
  it("rejects unknown collections and documents without an id", async () => {
    const store = createMemoryStoreAdapter();
    await expect(store.get("nope" as never, "x")).rejects.toThrow(/unknown collection/);
    await expect(store.put("patients", { id: "" })).rejects.toThrow(/non-empty string id/);
    await expect(store.setMeta("k", 1 as never)).rejects.toThrow(/strings/);
  });

  it("reports non-empty collection counts", async () => {
    const store = createMemoryStoreAdapter();
    await store.bulkPut("patients", [{ id: "a" }, { id: "b" }]);
    expect(store.counts()).toEqual({ patients: 2 });
  });
});

describe("collections registry", () => {
  it("contains core, admin, citizen and a remote_* mirror of each", () => {
    for (const name of [
      "patients",
      "idempotency",
      "syncRuns",
      "deviceSessions",
      "accessGrants",
      "exportAudits",
      "citizenAccounts",
      "accessEvents",
    ]) {
      expect(LOCAL_COLLECTIONS).toContain(name);
      expect(COLLECTIONS).toContain(`remote_${name}`);
    }
    expect(COLLECTIONS).toHaveLength(LOCAL_COLLECTIONS.length * 2);
    expect(new Set(COLLECTIONS).size).toBe(COLLECTIONS.length);
  });

  it("resolves entity types from types, collections and camelCase", () => {
    expect(resolveEntityType("follow_up")).toBe("follow_up");
    expect(resolveEntityType("followUps")).toBe("follow_up");
    expect(resolveEntityType("followUp")).toBe("follow_up");
    expect(resolveEntityType("nope")).toBeNull();
  });
});

describe("remote store view", () => {
  it("maps collections to remote_* and meta to remote.*", async () => {
    const base = createMemoryStoreAdapter();
    const view = createRemoteStoreView(base, () => ["k"]);
    await view.put("patients", { id: "p" });
    await view.setMeta("k", "v");
    expect(await base.get("remote_patients", "p")).toEqual({ id: "p" });
    expect(await base.get("patients", "p")).toBeUndefined();
    expect(await base.getMeta("remote.k")).toBe("v");
    expect(await view.getMeta("k")).toBe("v");
    await view.transaction(async (tx) => {
      await tx.bulkPut("reviews", [{ id: "r" }]);
      expect(await tx.getAll("reviews")).toHaveLength(1);
      await tx.delete("reviews", "r");
      expect(await tx.get("reviews", "r")).toBeUndefined();
    });
    await base.put("patients", { id: "local" });
    await view.clearAll();
    expect(await base.getAll("remote_patients")).toEqual([]);
    expect(await base.get("patients", "local")).toBeDefined();
    expect(await base.getMeta("remote.k")).toBe("");
    expect(() => view.get("remote_patients", "x")).toThrow(/not a local collection/);
  });
});
