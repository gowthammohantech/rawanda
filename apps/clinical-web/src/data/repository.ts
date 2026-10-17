/**
 * Repository bootstrap (FND-11 task 3, CLN-02 task 1): IndexedDB `laif-clinical` (Dexie) + the
 * pinned, ticking demo clock + browser UUIDs + the demo session as actor. `createCareRepository`
 * wraps every call in `withSimulatedTransport` (latency, offline, 500/503, timeout) for this web
 * app. This is the ONLY repository factory of the clinical app (no second one).
 *
 * Actor scope (CLN-02): the persona's FND-06 scope narrowed to the ACTIVE facility, so the
 * repository itself refuses (`FORBIDDEN` + `access.denied`) any read or write outside the facility
 * the user is working in — not only out-of-scope facilities (T-02). A facility switch therefore
 * changes what the repository returns, and `clinicalKeys` are facility-scoped to match.
 */
import { actorForPersona, type ActorContext } from "@laif/auth-demo";
import { createDemoClock, DEMO_CLOCK_DEFAULT_ISO } from "@laif/domain";
import {
  createCareRepository,
  dexieDbName,
  type CareRepository,
  type StoreAdapter,
} from "@laif/repositories";
import { createDexieStoreAdapter } from "@laif/repositories/dexie";
import { createWebIdGenerator } from "@laif/repositories/ids/web";

import { APP_ID, IS_E2E } from "../app/config.ts";
import type { AppSession, ClinicalSessionState } from "../session/session-store.ts";

export type CreateAppRepositoryOptions = {
  session: AppSession;
  /** Test seam: e.g. a memory adapter (default: Dexie `laif-clinical`). */
  store?: StoreAdapter;
  /** Skip the simulated latency (default: on in `VITE_LAIF_E2E=1` builds). */
  noLatency?: boolean;
};

/** The repository actor of a clinical session: persona role, scope = the active facility only. */
export function actorForSession(state: ClinicalSessionState): ActorContext {
  return {
    ...actorForPersona(state.persona),
    scope: { kind: "facility", facilityIds: [state.activeFacilityId] },
  };
}

export function createAppRepository(options: CreateAppRepositoryOptions): CareRepository {
  const { session, store, noLatency = IS_E2E } = options;
  return createCareRepository({
    store: store ?? createDexieStoreAdapter({ dbName: dexieDbName(APP_ID) }),
    // The seed's `meta.demoClockIso` is DEMO_CLOCK_DEFAULT_ISO (08:00 Kigali, 14 Oct 2026).
    clock: createDemoClock({ pinnedIso: DEMO_CLOCK_DEFAULT_ISO, mode: "ticking" }),
    ids: createWebIdGenerator(),
    appId: APP_ID,
    getActor: () => {
      const state = session.state();
      return state === null ? null : actorForSession(state);
    },
    ...(noLatency ? { sleep: () => Promise.resolve() } : {}),
  });
}
