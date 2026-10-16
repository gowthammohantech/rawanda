/**
 * `runStoreAdapterContract(name, factory)` — the shared adapter contract (FND-07 task 12). Run
 * here against the memory adapter; FND-08 runs it against Dexie (fake-indexeddb) and SQLite
 * (better-sqlite3). Import from `@laif/repositories/contract-suite` inside a Vitest file.
 */
import { describe, expect, it } from "vitest";

import { COLLECTIONS } from "./collections.ts";
import type { StoreAdapter, StoreAdapterFactory } from "./store-adapter.ts";

type Doc = { id: string; n: number; nested?: { list: number[]; label: string | null } };

const doc = (id: string, n = 1): Doc => ({ id, n, nested: { list: [n, n + 1], label: null } });

export function runStoreAdapterContract(name: string, factory: StoreAdapterFactory): void {
  describe(`StoreAdapter contract: ${name}`, () => {
    let store: StoreAdapter;
    const fresh = async (): Promise<StoreAdapter> => {
      store = await factory();
      return store;
    };

    it("get returns undefined for a missing document", async () => {
      const s = await fresh();
      expect(await s.get("patients", "missing")).toBeUndefined();
    });

    it("put then get round-trips a JSON document", async () => {
      const s = await fresh();
      await s.put("patients", doc("p1", 7));
      expect(await s.get<Doc>("patients", "p1")).toEqual(doc("p1", 7));
    });

    it("returns copies: mutating a read or written value does not change the store", async () => {
      const s = await fresh();
      const value = doc("p1");
      await s.put("patients", value);
      value.n = 99;
      const read = await s.get<Doc>("patients", "p1");
      expect(read?.n).toBe(1);
      if (read) read.n = 42;
      expect((await s.get<Doc>("patients", "p1"))?.n).toBe(1);
    });

    it("put replaces an existing document with the same id", async () => {
      const s = await fresh();
      await s.put("patients", doc("p1", 1));
      await s.put("patients", doc("p1", 2));
      expect((await s.getAll<Doc>("patients")).map((d) => d.n)).toEqual([2]);
    });

    it("getAll returns [] for an empty collection", async () => {
      const s = await fresh();
      expect(await s.getAll("screenings")).toEqual([]);
    });

    it("getAll orders by id ascending", async () => {
      const s = await fresh();
      await s.bulkPut("patients", [doc("c"), doc("a"), doc("b")]);
      expect((await s.getAll<Doc>("patients")).map((d) => d.id)).toEqual(["a", "b", "c"]);
    });

    it("bulkPut writes every document", async () => {
      const s = await fresh();
      await s.bulkPut(
        "reviews",
        Array.from({ length: 50 }, (_, i) => doc(`r${String(i).padStart(3, "0")}`, i)),
      );
      expect(await s.getAll("reviews")).toHaveLength(50);
    });

    it("bulkPut with an empty list is a no-op", async () => {
      const s = await fresh();
      await s.bulkPut("reviews", []);
      expect(await s.getAll("reviews")).toEqual([]);
    });

    it("collections are isolated from each other", async () => {
      const s = await fresh();
      await s.put("patients", doc("x"));
      expect(await s.get("screenings", "x")).toBeUndefined();
      expect(await s.get("remote_patients", "x")).toBeUndefined();
    });

    it("delete removes a document and ignores a missing one", async () => {
      const s = await fresh();
      await s.put("patients", doc("p1"));
      await s.delete("patients", "p1");
      await s.delete("patients", "never");
      expect(await s.get("patients", "p1")).toBeUndefined();
    });

    it("supports every registered collection, including remote_* mirrors", async () => {
      const s = await fresh();
      for (const c of COLLECTIONS) await s.put(c, doc(`id-${c}`));
      for (const c of COLLECTIONS) expect(await s.get<Doc>(c, `id-${c}`)).toEqual(doc(`id-${c}`));
    });

    it("meta: missing key is undefined; set / overwrite / read", async () => {
      const s = await fresh();
      expect(await s.getMeta("seedVersion")).toBeUndefined();
      await s.setMeta("seedVersion", "seed-v1");
      await s.setMeta("seedVersion", "seed-v2");
      expect(await s.getMeta("seedVersion")).toBe("seed-v2");
    });

    it("meta stores the empty string", async () => {
      const s = await fresh();
      await s.setMeta("k", "");
      expect(await s.getMeta("k")).toBe("");
    });

    it("clearAll removes every document and every meta key", async () => {
      const s = await fresh();
      await s.put("patients", doc("p1"));
      await s.put("remote_patients", doc("p1"));
      await s.setMeta("seedVersion", "x");
      await s.clearAll();
      expect(await s.getAll("patients")).toEqual([]);
      expect(await s.getAll("remote_patients")).toEqual([]);
      expect(await s.getMeta("seedVersion")).toBeUndefined();
    });

    it("transaction commits all writes and returns the callback result", async () => {
      const s = await fresh();
      const result = await s.transaction(async (tx) => {
        await tx.put("patients", doc("a"));
        await tx.put("screenings", doc("b"));
        await tx.setMeta("k", "v");
        return 42;
      });
      expect(result).toBe(42);
      expect(await s.get("patients", "a")).toBeDefined();
      expect(await s.get("screenings", "b")).toBeDefined();
      expect(await s.getMeta("k")).toBe("v");
    });

    it("transaction rolls back every write when the callback throws", async () => {
      const s = await fresh();
      await s.put("patients", doc("keep", 1));
      await expect(
        s.transaction(async (tx) => {
          await tx.put("patients", doc("keep", 2));
          await tx.put("patients", doc("new"));
          await tx.delete("patients", "keep");
          await tx.setMeta("k", "v");
          throw new Error("boom");
        }),
      ).rejects.toThrow("boom");
      expect(await s.get<Doc>("patients", "keep")).toEqual(doc("keep", 1));
      expect(await s.get("patients", "new")).toBeUndefined();
      expect(await s.getMeta("k")).toBeUndefined();
    });

    it("transaction rolls back a clearAll when the callback throws", async () => {
      const s = await fresh();
      await s.put("patients", doc("keep"));
      await s.setMeta("k", "v");
      await expect(
        s.transaction(async (tx) => {
          await tx.clearAll();
          await tx.put("patients", doc("other"));
          throw new Error("boom");
        }),
      ).rejects.toThrow("boom");
      expect(await s.get("patients", "keep")).toBeDefined();
      expect(await s.get("patients", "other")).toBeUndefined();
      expect(await s.getMeta("k")).toBe("v");
    });

    it("reads inside a transaction see its own uncommitted writes", async () => {
      const s = await fresh();
      await s.put("patients", doc("a"));
      await s.transaction(async (tx) => {
        await tx.put("patients", doc("b"));
        await tx.delete("patients", "a");
        await tx.setMeta("k", "v");
        expect((await tx.getAll<Doc>("patients")).map((d) => d.id)).toEqual(["b"]);
        expect(await tx.get("patients", "a")).toBeUndefined();
        expect(await tx.getMeta("k")).toBe("v");
      });
    });

    it("clearAll inside a transaction hides earlier data from reads in it", async () => {
      const s = await fresh();
      await s.put("patients", doc("a"));
      await s.transaction(async (tx) => {
        await tx.clearAll();
        expect(await tx.getAll("patients")).toEqual([]);
        await tx.put("patients", doc("z"));
      });
      expect((await s.getAll<Doc>("patients")).map((d) => d.id)).toEqual(["z"]);
    });

    it("nested transaction joins the outer one (rolls back together)", async () => {
      const s = await fresh();
      await expect(
        s.transaction(async (tx) => {
          await tx.transaction(async (inner) => inner.put("patients", doc("n")));
          throw new Error("outer");
        }),
      ).rejects.toThrow("outer");
      expect(await s.get("patients", "n")).toBeUndefined();
    });

    it("concurrent transactions are serialised (no lost updates)", async () => {
      const s = await fresh();
      await s.setMeta("counter", "0");
      await Promise.all(
        Array.from({ length: 10 }, () =>
          s.transaction(async (tx) => {
            const value = Number(await tx.getMeta("counter"));
            await tx.setMeta("counter", String(value + 1));
          }),
        ),
      );
      expect(await s.getMeta("counter")).toBe("10");
    });

    it("a failed transaction does not block later ones", async () => {
      const s = await fresh();
      await expect(s.transaction(() => Promise.reject(new Error("x")))).rejects.toThrow("x");
      await s.transaction((tx) => tx.put("patients", doc("after")));
      expect(await s.get("patients", "after")).toBeDefined();
    });

    it("drops undefined members like JSON does", async () => {
      const s = await fresh();
      await s.put("patients", { id: "u", keep: 1, gone: undefined });
      expect(await s.get("patients", "u")).toEqual({ id: "u", keep: 1 });
    });

    it("stores unicode text and nested arrays faithfully", async () => {
      const s = await fresh();
      const value = { id: "k", name: "Umurwayi — ğüñ ✓", deep: [[1, [2, [3]]], { a: null }] };
      await s.put("patients", value);
      expect(await s.get("patients", "k")).toEqual(value);
    });
  });
}
