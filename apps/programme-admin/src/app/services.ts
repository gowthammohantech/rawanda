/** Everything the app needs at runtime, created once in `main.tsx` (or by a test). */
import type { I18nInstance } from "@laif/i18n";
import type { CareRepository } from "@laif/repositories";
import { QueryClient } from "@tanstack/react-query";

import type { AppSession } from "./session.ts";

export type AppServices = {
  i18n: I18nInstance;
  session: AppSession;
  repo: CareRepository;
  queryClient: QueryClient;
};

export function createAppQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: { retry: 1, staleTime: 30_000, refetchOnWindowFocus: false },
      mutations: { retry: false },
    },
  });
}
