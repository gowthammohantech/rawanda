/** Everything the app needs at runtime, created once in `main.tsx` (or by a test). */
import type { I18nInstance } from "@laif/i18n";
import type { CareRepository } from "@laif/repositories";
import { QueryClient } from "@tanstack/react-query";

import { shouldRetryRead } from "../data/errors.ts";

import type { AppSession } from "../session/session-store.ts";

export type AppServices = {
  i18n: I18nInstance;
  session: AppSession;
  repo: CareRepository;
  queryClient: QueryClient;
};

/**
 * CLN-02 task 5: reads retry once (never FORBIDDEN / NOT_FOUND / VALIDATION_ERROR / CONFLICT),
 * stay fresh for 15 s and refetch on window focus; mutations never retry automatically
 * (`useIdempotentMutation` offers a manual same-key retry).
 */
export function createAppQueryClient(options: { retryDelayMs?: number } = {}): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: {
        retry: shouldRetryRead,
        ...(options.retryDelayMs === undefined ? {} : { retryDelay: options.retryDelayMs }),
        staleTime: 15_000,
        refetchOnWindowFocus: true,
      },
      mutations: { retry: false },
    },
  });
}
