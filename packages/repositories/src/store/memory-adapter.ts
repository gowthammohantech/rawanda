/**
 * In-memory `StoreAdapter` (tests, Node, and the default before FND-08's persistent adapters).
 * Documents are kept as JSON strings, so every read returns a fresh copy and non-JSON values
 * behave exactly as they would after a reload from IndexedDB / SQLite.
 *
 * Transactions run one at a time (a promise chain); writes go to an overlay that is applied on
 * success and dropped on failure. Plain (non-transaction) writes are single-write transactions.
 */
import { isCollectionName, type CollectionName } from "./collections.ts";
import type { StoreAdapter } from "./store-adapter.ts";

type Table = Map<string, string>;

type Overlay = {
  cleared: boolean;
  records: Map<CollectionName, Map<string, string | null>>;
  meta: Map<string, string | null>;
};

function assertCollection(c: string): asserts c is CollectionName {
  if (!isCollectionName(c)) throw new RangeError(`unknown collection: ${c}`);
}

function assertId(value: { id?: unknown }): string {
  if (typeof value.id !== "string" || value.id.length === 0) {
    throw new TypeError("store documents need a non-empty string id");
  }
  return value.id;
}

/** Runs `fn` and turns a synchronous throw into a rejected promise. */
function attempt<T>(fn: () => T): Promise<T> {
  try {
    return Promise.resolve(fn());
  } catch (error) {
    return Promise.reject(error instanceof Error ? error : new Error(String(error)));
  }
}

const byId = (a: string, b: string): number => (a < b ? -1 : a > b ? 1 : 0);

export type MemoryStoreAdapter = StoreAdapter & {
  /** Number of documents per non-empty collection (tests / diagnostics). */
  counts(): Record<string, number>;
};

export function createMemoryStoreAdapter(): MemoryStoreAdapter {
  const tables = new Map<CollectionName, Table>();
  const meta = new Map<string, string>();
  let chain: Promise<unknown> = Promise.resolve();

  const table = (c: CollectionName): Table => {
    let t = tables.get(c);
    if (!t) {
      t = new Map();
      tables.set(c, t);
    }
    return t;
  };

  function serialised<R>(fn: () => Promise<R>): Promise<R> {
    const run = chain.then(fn);
    chain = run.catch(() => undefined);
    return run;
  }

  function commit(overlay: Overlay): void {
    if (overlay.cleared) {
      tables.clear();
      meta.clear();
    }
    for (const [c, rows] of overlay.records) {
      const t = table(c);
      for (const [id, json] of rows) {
        if (json === null) t.delete(id);
        else t.set(id, json);
      }
    }
    for (const [key, value] of overlay.meta) {
      if (value === null) meta.delete(key);
      else meta.set(key, value);
    }
  }

  function txAdapter(overlay: Overlay): StoreAdapter {
    const rows = (c: CollectionName): Map<string, string | null> => {
      let r = overlay.records.get(c);
      if (!r) {
        r = new Map();
        overlay.records.set(c, r);
      }
      return r;
    };
    const readJson = (c: CollectionName, id: string): string | undefined => {
      const staged = overlay.records.get(c)?.get(id);
      if (staged !== undefined) return staged ?? undefined;
      if (overlay.cleared) return undefined;
      return tables.get(c)?.get(id);
    };
    const putJson = (c: CollectionName, v: { id: string }): void => {
      rows(c).set(assertId(v), JSON.stringify(v));
    };
    const listAll = <T>(c: CollectionName): T[] => {
      assertCollection(c);
      const merged = new Map<string, string>(overlay.cleared ? [] : (tables.get(c) ?? []));
      for (const [id, json] of overlay.records.get(c) ?? []) {
        if (json === null) merged.delete(id);
        else merged.set(id, json);
      }
      return [...merged.keys()].sort(byId).map((id) => JSON.parse(merged.get(id) as string) as T);
    };
    const tx: StoreAdapter = {
      get<T>(c: CollectionName, id: string): Promise<T | undefined> {
        return attempt(() => {
          assertCollection(c);
          const json = readJson(c, id);
          return json === undefined ? undefined : (JSON.parse(json) as T);
        });
      },
      getAll<T>(c: CollectionName): Promise<T[]> {
        return attempt(() => listAll<T>(c));
      },
      put<T extends { id: string }>(c: CollectionName, v: T): Promise<void> {
        return attempt(() => {
          assertCollection(c);
          putJson(c, v);
        });
      },
      bulkPut<T extends { id: string }>(c: CollectionName, vs: T[]): Promise<void> {
        return attempt(() => {
          assertCollection(c);
          for (const v of vs) putJson(c, v);
        });
      },
      delete(c: CollectionName, id: string): Promise<void> {
        return attempt(() => {
          assertCollection(c);
          rows(c).set(id, null);
        });
      },
      clearAll(): Promise<void> {
        overlay.cleared = true;
        overlay.records.clear();
        overlay.meta.clear();
        return Promise.resolve();
      },
      transaction<R>(fn: (inner: StoreAdapter) => Promise<R>): Promise<R> {
        return fn(tx);
      },
      getMeta(key: string): Promise<string | undefined> {
        const staged = overlay.meta.get(key);
        if (staged !== undefined) return Promise.resolve(staged ?? undefined);
        return Promise.resolve(overlay.cleared ? undefined : meta.get(key));
      },
      setMeta(key: string, v: string): Promise<void> {
        return attempt(() => {
          if (typeof v !== "string") throw new TypeError("meta values are strings");
          overlay.meta.set(key, v);
        });
      },
    };
    return tx;
  }

  function transaction<R>(fn: (tx: StoreAdapter) => Promise<R>): Promise<R> {
    return serialised(async () => {
      const overlay: Overlay = { cleared: false, records: new Map(), meta: new Map() };
      const result = await fn(txAdapter(overlay));
      commit(overlay);
      return result;
    });
  }

  const single = <R>(fn: (tx: StoreAdapter) => Promise<R>): Promise<R> => transaction(fn);

  return {
    get<T>(c: CollectionName, id: string): Promise<T | undefined> {
      return attempt(() => {
        assertCollection(c);
        const json = tables.get(c)?.get(id);
        return json === undefined ? undefined : (JSON.parse(json) as T);
      });
    },
    getAll<T>(c: CollectionName): Promise<T[]> {
      return attempt(() => {
        assertCollection(c);
        const t = tables.get(c);
        if (!t) return [];
        return [...t.keys()].sort(byId).map((id) => JSON.parse(t.get(id) as string) as T);
      });
    },
    put: (c, v) => single((tx) => tx.put(c, v)),
    bulkPut: (c, vs) => single((tx) => tx.bulkPut(c, vs)),
    delete: (c, id) => single((tx) => tx.delete(c, id)),
    clearAll: () => single((tx) => tx.clearAll()),
    transaction,
    getMeta: (key) => Promise.resolve(meta.get(key)),
    setMeta: (key, v) => single((tx) => tx.setMeta(key, v)),
    counts() {
      const out: Record<string, number> = {};
      for (const [c, t] of tables) if (t.size > 0) out[c] = t.size;
      return out;
    },
  };
}
