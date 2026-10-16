/**
 * App providers (FND-11, CLN-01): I18nProvider → QueryClientProvider → RepositoryProvider (the
 * FND-07 repository; data layer in CLN-02) → SessionProvider (demo persona + active facility) →
 * ToastProvider. The router is mounted by `App` inside them; tests inject a
 * memory-adapter repository by passing their own `AppServices`.
 */
import { I18nProvider } from "@laif/i18n";
import type { CareRepository } from "@laif/repositories";
import { ToastProvider } from "@laif/ui-web";
import { QueryClientProvider } from "@tanstack/react-query";
import { createContext, useContext, type ReactNode } from "react";

import { SessionProvider } from "../session/SessionProvider.tsx";
import type { AppServices } from "./services.ts";

const RepositoryContext = createContext<CareRepository | null>(null);

export function RepositoryProvider({
  repo,
  children,
}: {
  repo: CareRepository;
  children?: ReactNode;
}) {
  return <RepositoryContext.Provider value={repo}>{children}</RepositoryContext.Provider>;
}

export function useRepository(): CareRepository {
  const repo = useContext(RepositoryContext);
  if (repo === null) throw new Error("useRepository must be used inside <RepositoryProvider>");
  return repo;
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
          <SessionProvider session={services.session}>
            <ToastProvider>{children}</ToastProvider>
          </SessionProvider>
        </RepositoryProvider>
      </QueryClientProvider>
    </I18nProvider>
  );
}
