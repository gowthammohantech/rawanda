/**
 * Citizen data layer bootstrap (CTZ-01; evolves FND-11 `repository.ts`): ONE `CitizenRepository`
 * per app run over the platform store (`laif-citizen.db` on device, Dexie on the Expo web
 * target), the pinned, ticking demo clock, platform UUIDs and the persona session as actor.
 * Every call goes through the FND-07 simulated transport (latency, offline, 500/503, timeout,
 * conflict-next-write); `repo.demo` (reset / faults / scenarios) is never faulted.
 *
 * Screens read through `useCitizenRepo()` / the query hooks in `queries.ts` — never the store.
 */
import { actorForPersona } from "@laif/auth-demo";
import { createDemoClock, DEMO_CLOCK_DEFAULT_ISO } from "@laif/domain";
import type { StoreAdapter } from "@laif/repositories";
import { createCitizenRepository, type CitizenRepository } from "@laif/repositories/citizen";
import { createContext, useContext, type ReactNode } from "react";

import { IS_E2E } from "../config.ts";
import { platform } from "../platform";
import type { AppSession } from "../session.ts";

export type { CitizenRepository };

export type CreateAppRepositoryOptions = {
  session: AppSession;
  store: StoreAdapter;
  /** Skip the simulated latency (default: on in `EXPO_PUBLIC_LAIF_E2E=1` builds). */
  noLatency?: boolean;
};

export function createAppRepository(options: CreateAppRepositoryOptions): CitizenRepository {
  const { session, store, noLatency = IS_E2E } = options;
  return createCitizenRepository({
    store,
    // The seed's `meta.demoClockIso` is DEMO_CLOCK_DEFAULT_ISO (08:00 Kigali, 14 Oct 2026).
    clock: createDemoClock({ pinnedIso: DEMO_CLOCK_DEFAULT_ISO, mode: "ticking" }),
    ids: platform.createIds(),
    getActor: () => {
      const persona = session.current();
      return persona === null ? null : actorForPersona(persona);
    },
    ...(noLatency ? { sleep: () => Promise.resolve() } : {}),
  });
}

const CitizenRepoContext = createContext<CitizenRepository | null>(null);

/** Mounted by `Boot` once the local database is open and seeded. */
export function CitizenRepoProvider({
  repo,
  children,
}: {
  repo: CitizenRepository;
  children?: ReactNode;
}) {
  return <CitizenRepoContext.Provider value={repo}>{children}</CitizenRepoContext.Provider>;
}

export function useCitizenRepo(): CitizenRepository {
  const repo = useContext(CitizenRepoContext);
  if (repo === null) throw new Error("useCitizenRepo must be used inside <CitizenRepoProvider>");
  return repo;
}
