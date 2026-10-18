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
import { MutationCache, QueryCache, QueryClient } from "@tanstack/react-query";

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

/**
 * ADM-09 (T-09): when a query or mutation fails after "Expire session now", the session store is
 * told (`noticeExpiry`) and RequireSession redirects to the sign-in with `next` = this view.
 */
export function createAppQueryClient(
  session?: Pick<AdminSessionStore, "noticeExpiry">,
): QueryClient {
  const onError = () => session?.noticeExpiry();
  return new QueryClient({
    queryCache: new QueryCache({ onError }),
    mutationCache: new MutationCache({ onError }),
    defaultOptions: {
      // ADM-09: the data is local (IndexedDB), so a browser that is offline keeps querying and
      // writing (`networkMode: "always"`; TanStack's default would pause every query offline).
      queries: { retry: 1, staleTime: 30_000, refetchOnWindowFocus: false, networkMode: "always" },
      mutations: { retry: false, networkMode: "always" },
    },
  });
}

export type CreateAppServicesOptions = {
  i18n: I18nInstance;
  /** Test seams. */
  store?: StoreAdapter;
  noLatency?: boolean;
  session?: AdminSessionStore;
  sleep?: (ms: number) => Promise<void>;
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
    queryClient: createAppQueryClient(session),
    repo: createAppRepository({
      session,
      clock,
      ids,
      ...(options.store === undefined ? {} : { store: options.store }),
      ...(options.noLatency === undefined ? {} : { noLatency: options.noLatency }),
      ...(options.sleep === undefined ? {} : { sleep: options.sleep }),
    }),
  };
}
