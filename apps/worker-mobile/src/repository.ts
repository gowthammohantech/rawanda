/**
 * Repository bootstrap (FND-11 task 6): the platform store (`laif-worker.db` on device, Dexie on
 * the Expo web target) + the pinned, ticking demo clock + platform UUIDs + the persona session as
 * actor. `appId: 'worker'` enables the FND-07 sync queue against the in-app simulated remote;
 * only sync sends go through the simulated transport faults.
 */
import { actorForPersona } from "@laif/auth-demo";
import { createDemoClock, DEMO_CLOCK_DEFAULT_ISO } from "@laif/domain";
import { createCareRepository, type CareRepository, type StoreAdapter } from "@laif/repositories";

import { APP_ID, IS_E2E } from "./config.ts";
import { platform } from "./platform";
import type { AppSession } from "./session.ts";

export type CreateAppRepositoryOptions = {
  session: AppSession;
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
    getActor: () => {
      const persona = session.current();
      return persona === null ? null : actorForPersona(persona);
    },
    ...(noLatency ? { sleep: () => Promise.resolve() } : {}),
  });
}
