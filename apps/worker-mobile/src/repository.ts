/**
 * Repository bootstrap (FND-11 task 6): the platform store (`laif-worker.db` on device, Dexie on
 * the Expo web target) + the pinned, ticking demo clock + platform UUIDs + the device session
 * store as actor (null while signed out). `appId: 'worker'` enables the FND-07 sync queue against the in-app simulated remote;
 * only sync sends go through the simulated transport faults.
 */
import { createDemoClock, DEMO_CLOCK_DEFAULT_ISO } from "@laif/domain";
import { createCareRepository, type CareRepository, type StoreAdapter } from "@laif/repositories";

import { APP_ID, IS_E2E } from "./config.ts";
import { platform } from "./platform";
import type { SessionStore } from "./session/store.ts";

export type CreateAppRepositoryOptions = {
  session: SessionStore;
  store: StoreAdapter;
  /** Skip the simulated latency (default: on in `EXPO_PUBLIC_LAIF_E2E=1` builds). */
  noLatency?: boolean;
};

export function createAppRepository(options: CreateAppRepositoryOptions): CareRepository {
  const { session, store, noLatency = IS_E2E } = options;
  return createCareRepository({
    store,
    // The seed's `meta.demoClockIso` is DEMO_CLOCK_DEFAULT_ISO (08:00 Kigali, 14 Oct 2026).
    clock: createDemoClock({ pinnedIso: DEMO_CLOCK_DEFAULT_ISO, mode: "ticking" }),
    ids: platform.createIds(),
    appId: APP_ID,
    // HWM-01: the signed-in persona, scoped to the signed-in facility, with its device session.
    getActor: () => session.actor(),
    ...(noLatency ? { sleep: () => Promise.resolve() } : {}),
  });
}
