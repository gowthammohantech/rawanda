/**
 * Repository bootstrap (FND-11 task 3): IndexedDB `laif-admin` (Dexie) + the pinned, ticking
 * demo clock + browser UUIDs + the persona session as actor. `createCareRepository` wraps every
 * call in `withSimulatedTransport` (latency, offline, 500/503, timeout) for this web app.
 */
import { actorForPersona } from "@laif/auth-demo";
import { createDemoClock, DEMO_CLOCK_DEFAULT_ISO } from "@laif/domain";
import {
  createCareRepository,
  dexieDbName,
  type CareRepository,
  type StoreAdapter,
} from "@laif/repositories";
import { createDexieStoreAdapter } from "@laif/repositories/dexie";
import { createWebIdGenerator } from "@laif/repositories/ids/web";

import { APP_ID, IS_E2E } from "./config.ts";
import type { AppSession } from "./session.ts";

export type CreateAppRepositoryOptions = {
  session: AppSession;
  /** Test seam: e.g. a memory adapter (default: Dexie `laif-admin`). */
  store?: StoreAdapter;
  /** Skip the simulated latency (default: on in `VITE_LAIF_E2E=1` builds). */
  noLatency?: boolean;
};

export function createAppRepository(options: CreateAppRepositoryOptions): CareRepository {
  const { session, store, noLatency = IS_E2E } = options;
  return createCareRepository({
    store: store ?? createDexieStoreAdapter({ dbName: dexieDbName(APP_ID) }),
    // The seed's `meta.demoClockIso` is DEMO_CLOCK_DEFAULT_ISO (08:00 Kigali, 14 Oct 2026).
    clock: createDemoClock({ pinnedIso: DEMO_CLOCK_DEFAULT_ISO, mode: "ticking" }),
    ids: createWebIdGenerator(),
    appId: APP_ID,
    getActor: () => {
      const persona = session.current();
      return persona === null ? null : actorForPersona(persona);
    },
    ...(noLatency ? { sleep: () => Promise.resolve() } : {}),
  });
}
