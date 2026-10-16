/**
 * `renderWithProviders` for web component tests (FND-09 task 8): wraps the UI in
 * `I18nProvider` (synchronous test i18n), `MemoryRouter` and `QueryClientProvider` (retry
 * off), plus an optional repository context supplied by the caller (FND-07/FND-11 own the
 * actual repository context, so it is injected rather than imported here).
 *
 * Peer dependencies (provided by the consuming web package): react, react-dom, react-router,
 * @tanstack/react-query, @testing-library/react.
 */
import { createTestI18n, I18nProvider, type I18nInstance, type Language } from "@laif/i18n";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, type RenderOptions, type RenderResult } from "@testing-library/react";
import type { Context, ReactElement, ReactNode } from "react";
import { MemoryRouter } from "react-router";

/** A repository (or any) React context and the value to provide. */
export type ContextValue<T = unknown> = { context: Context<T>; value: T };

export type RenderWithProvidersOptions<R = unknown> = Omit<RenderOptions, "wrapper"> & {
  /** UI language (default `en`). */
  language?: Language;
  /** Initial router location (default `/`). */
  route?: string;
  /** Optional repository context, e.g. `{ context: RepositoryContext, value: repo }`. */
  repo?: ContextValue<R>;
  /** Reuse an i18n instance (e.g. to assert language persistence). */
  i18n?: I18nInstance;
  queryClient?: QueryClient;
};

export type RenderWithProvidersResult = RenderResult & {
  i18n: I18nInstance;
  queryClient: QueryClient;
};

/** A QueryClient for tests: no retries, no cache GC timers lingering after a test. */
export function createTestQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: { retry: false, gcTime: Number.POSITIVE_INFINITY },
      mutations: { retry: false },
    },
  });
}

export function renderWithProviders<R = unknown>(
  ui: ReactElement,
  options: RenderWithProvidersOptions<R> = {},
): RenderWithProvidersResult {
  const { language = "en", route = "/", repo, i18n: given, queryClient: qc, ...rest } = options;
  const i18n = given ?? createTestI18n(language);
  const queryClient = qc ?? createTestQueryClient();

  function Wrapper({ children }: { children?: ReactNode }) {
    const inner =
      repo === undefined ? (
        children
      ) : (
        <ProvideContext context={repo.context as Context<unknown>} value={repo.value}>
          {children}
        </ProvideContext>
      );
    return (
      <I18nProvider i18n={i18n}>
        <QueryClientProvider client={queryClient}>
          <MemoryRouter initialEntries={[route]}>{inner}</MemoryRouter>
        </QueryClientProvider>
      </I18nProvider>
    );
  }

  const result = render(ui, { wrapper: Wrapper, ...rest });
  return Object.assign(result, { i18n, queryClient });
}

function ProvideContext({
  context,
  value,
  children,
}: {
  context: Context<unknown>;
  value: unknown;
  children?: ReactNode;
}) {
  const Provider = context.Provider;
  return <Provider value={value}>{children}</Provider>;
}
