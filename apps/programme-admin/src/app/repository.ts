/**
 * Repository bootstrap (FND-11 task 3): IndexedDB `laif-admin` (Dexie) + the pinned, ticking
 * demo clock + browser UUIDs + the admin session as actor (scope from its AccessGrant, ADM-01).
 * `createCareRepository` wraps every call in `withSimulatedTransport` (latency, offline, 500/503,
 * timeout) for this web app. Seeding = FND-07 `ensureSeeded` / `resetDemo` with the admin slice
 * (base seed + `buildAdminAnalyticsOverlay`), idempotent via `meta.seedVersion`.
 */
import type { DemoClock, IdGenerator } from "@laif/domain";
import {
  createCareRepository,
  dexieDbName,
  type CareRepository,
  type StoreAdapter,
} from "@laif/repositories";
import { createDexieStoreAdapter } from "@laif/repositories/dexie";

import type { AdminSessionStore } from "../auth/sessionStore.ts";
import { APP_ID, IS_E2E } from "./config.ts";

export type CreateAppRepositoryOptions = {
  session: AdminSessionStore;
  clock: DemoClock;
  ids: IdGenerator;
  /** Test seam: e.g. a memory adapter (default: Dexie `laif-admin`). */
  store?: StoreAdapter;
  /** Skip the simulated latency (default: on in `VITE_LAIF_E2E=1` builds). */
  noLatency?: boolean;
  /** Test seam: replaces the latency sleep (e.g. a gate that holds every call). */
  sleep?: (ms: number) => Promise<void>;
};

export function createAppRepository(options: CreateAppRepositoryOptions): CareRepository {
  const { session, store, clock, ids, noLatency = IS_E2E, sleep } = options;
  return createCareRepository({
    store: store ?? createDexieStoreAdapter({ dbName: dexieDbName(APP_ID) }),
    clock,
    ids,
    appId: APP_ID,
    getActor: () => session.actor(),
    ...(sleep !== undefined ? { sleep } : noLatency ? { sleep: () => Promise.resolve() } : {}),
  });
}
