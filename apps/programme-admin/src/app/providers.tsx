/**
 * App providers (FND-11): I18nProvider → QueryClientProvider → RepositoryProvider →
 * PersonaProvider → ToastProvider. The router is mounted by `App` inside them; tests inject a
 * memory-adapter repository by passing their own `AppServices`.
 */
import { I18nProvider } from "@laif/i18n";
import type { CareRepository } from "@laif/repositories";
import { ToastProvider } from "@laif/ui-web";
import { QueryClientProvider } from "@tanstack/react-query";
import {
  createContext,
  useCallback,
  useContext,
  useSyncExternalStore,
  type ReactNode,
} from "react";

import type { AppServices } from "./services.ts";
import type { AppPersona, AppSession } from "./session.ts";

const RepositoryContext = createContext<CareRepository | null>(null);
const SessionContext = createContext<AppSession | null>(null);

export function RepositoryProvider({
  repo,
  children,
}: {
  repo: CareRepository;
  children?: ReactNode;
}) {
  return <RepositoryContext.Provider value={repo}>{children}</RepositoryContext.Provider>;
}

export function PersonaProvider({
  session,
  children,
}: {
  session: AppSession;
  children?: ReactNode;
}) {
  return <SessionContext.Provider value={session}>{children}</SessionContext.Provider>;
}

export function useRepository(): CareRepository {
  const repo = useContext(RepositoryContext);
  if (repo === null) throw new Error("useRepository must be used inside <RepositoryProvider>");
  return repo;
}

export function useSession(): AppSession {
  const session = useContext(SessionContext);
  if (session === null) throw new Error("useSession must be used inside <PersonaProvider>");
  return session;
}

/** The signed-in demo persona; re-renders on every switch. */
export function usePersona(): AppPersona | null {
  const session = useSession();
  const subscribe = useCallback((listener: () => void) => session.subscribe(listener), [session]);
  const current = useCallback(() => session.current(), [session]);
  return useSyncExternalStore(subscribe, current, current);
}

export function AppProviders({
  services,
  children,
}: {
  services: AppServices;
  children?: ReactNode;
}) {
  return (
    <I18nProvider i18n={services.i18n}>
      <QueryClientProvider client={services.queryClient}>
        <RepositoryProvider repo={services.repo}>
          <PersonaProvider session={services.session}>
            <ToastProvider>{children}</ToastProvider>
          </PersonaProvider>
        </RepositoryProvider>
      </QueryClientProvider>
    </I18nProvider>
  );
}
