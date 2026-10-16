/**
 * Seed dataset ⇄ store records, and the dataset fingerprint of `getDemoState().datasetHash`.
 *
 * Decisions:
 * - Rulesets have no `id` in the domain type; they are stored with `id = version`.
 * - `datasetHash` covers every local data collection EXCEPT `auditEvents` (compared separately:
 *   "audit log equals baseline + one `demo.reset`"), `idempotency` and `syncRuns` (bookkeeping).
 *   Rows are hashed in `id` order, so the hash is adapter-independent.
 */
import { canonicalJson, fnv1a64Hex } from "@laif/domain";
import { SEED_COLLECTIONS, type SeedDataset, type SeedSlice } from "@laif/mock-data";

import { RepositoryError } from "./errors.ts";
import {
  isLocalCollectionName,
  LOCAL_COLLECTIONS,
  type LocalCollectionName,
} from "./store/collections.ts";
import type { StoreAdapter } from "./store/store-adapter.ts";

export type CollectionRecords = Partial<Record<LocalCollectionName, Array<{ id: string }>>>;

/** Collections excluded from `datasetHash`. */
export const UNHASHED_COLLECTIONS: readonly LocalCollectionName[] = [
  "auditEvents",
  "idempotency",
  "syncRuns",
];

const HASHED_COLLECTIONS = LOCAL_COLLECTIONS.filter((c) => !UNHASHED_COLLECTIONS.includes(c));

/** Store records of a seed / slice (overlay `extraCollections` must be registered). */
export function datasetToRecords(dataset: SeedDataset | SeedSlice): CollectionRecords {
  const out: CollectionRecords = {};
  for (const name of SEED_COLLECTIONS) {
    const rows = dataset[name] as unknown as Array<Record<string, unknown>>;
    out[name] =
      name === "rulesets"
        ? rows.map((r) => ({ ...r, id: String(r["version"]) }))
        : (structuredClone(rows) as Array<{ id: string }>);
  }
  const extra = "extraCollections" in dataset ? dataset.extraCollections : {};
  for (const [name, rows] of Object.entries(extra)) {
    if (!isLocalCollectionName(name)) {
      throw new RepositoryError("INTERNAL", {
        details: { message: `overlay collection ${name} is not in the COLLECTIONS registry` },
      });
    }
    out[name] = [...(out[name] ?? []), ...structuredClone(rows)];
  }
  return out;
}

const byId = (a: { id: string }, b: { id: string }): number =>
  a.id < b.id ? -1 : a.id > b.id ? 1 : 0;

/** Fingerprint of the data collections (see header). */
export function computeDatasetHash(records: CollectionRecords): string {
  const canonical: Record<string, unknown> = {};
  for (const name of HASHED_COLLECTIONS) {
    canonical[name] = [...(records[name] ?? [])].sort(byId);
  }
  return fnv1a64Hex(canonicalJson(canonical));
}

/** Reads the hashed collections of `store` (or a transaction) and fingerprints them. */
export async function readDatasetHash(store: StoreAdapter): Promise<string> {
  const records: CollectionRecords = {};
  for (const name of HASHED_COLLECTIONS) records[name] = await store.getAll<{ id: string }>(name);
  return computeDatasetHash(records);
}

/** Writes records into a (transaction) store. */
export async function writeRecords(store: StoreAdapter, records: CollectionRecords): Promise<void> {
  for (const [name, rows] of Object.entries(records)) {
    if (rows && rows.length > 0) await store.bulkPut(name as LocalCollectionName, rows);
  }
}
