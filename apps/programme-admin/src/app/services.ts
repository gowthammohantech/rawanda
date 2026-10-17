/** Everything the app needs at runtime, created once in `main.tsx` (or by a test). */
import {
  createDemoClock,
  DEMO_CLOCK_DEFAULT_ISO,
  type DemoClock,
  type IdGenerator,
} from "@laif/domain";
import type { I18nInstance } from "@laif/i18n";
import type { CareRepository, StoreAdapter } from "@laif/repositories";
import { createWebIdGenerator } from "@laif/repositories/ids/web";
import { QueryClient } from "@tanstack/react-query";

import { createAdminSessionStore, type AdminSessionStore } from "../auth/sessionStore.ts";
import { createAppRepository } from "./repository.ts";

export type AppServices = {
  i18n: I18nInstance;
  session: AdminSessionStore;
  repo: CareRepository;
  queryClient: QueryClient;
  /** The demo clock shared with the repository (session `startedAt`). */
  clock: DemoClock;
  /** Runtime ids (session correlation ids). */
  ids: IdGenerator;
};

export function createAppQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: { retry: 1, staleTime: 30_000, refetchOnWindowFocus: false },
      mutations: { retry: false },
    },
  });
}

export type CreateAppServicesOptions = {
  i18n: I18nInstance;
  /** Test seams. */
  store?: StoreAdapter;
  noLatency?: boolean;
  session?: AdminSessionStore;
};

export function createAppServices(options: CreateAppServicesOptions): AppServices {
  // The seed's `meta.demoClockIso` is DEMO_CLOCK_DEFAULT_ISO (08:00 Kigali, 14 Oct 2026).
  const clock = createDemoClock({ pinnedIso: DEMO_CLOCK_DEFAULT_ISO, mode: "ticking" });
  const ids = createWebIdGenerator();
  const session = options.session ?? createAdminSessionStore();
  return {
    i18n: options.i18n,
    session,
    clock,
    ids,
    queryClient: createAppQueryClient(),
    repo: createAppRepository({
      session,
      clock,
      ids,
      ...(options.store === undefined ? {} : { store: options.store }),
      ...(options.noLatency === undefined ? {} : { noLatency: options.noLatency }),
    }),
  };
}
