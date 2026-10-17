/**
 * App providers (FND-11, ADM-01): I18nProvider → QueryClientProvider → ServicesProvider
 * (repository, admin session store, demo clock, ids) → ToastProvider. The router is mounted by
 * `App` inside them; tests inject a memory-adapter repository through their own `AppServices`.
 */
import { I18nProvider } from "@laif/i18n";
import type { CareRepository } from "@laif/repositories";
import { ToastProvider } from "@laif/ui-web";
import { QueryClientProvider } from "@tanstack/react-query";
import { createContext, useContext, type ReactNode } from "react";

import {
  useAdminSessionState,
  type AdminSessionState,
  type AdminSessionStore,
} from "../auth/sessionStore.ts";
import type { AppServices } from "./services.ts";

const ServicesContext = createContext<AppServices | null>(null);

export function useServices(): AppServices {
  const services = useContext(ServicesContext);
  if (services === null) throw new Error("useServices must be used inside <AppProviders>");
  return services;
}

export function useRepository(): CareRepository {
  return useServices().repo;
}

/** The admin session store (`signIn`, `signOut`, `revalidate`, `actor`). */
export function useSessionStore(): AdminSessionStore {
  return useServices().session;
}

/** Subscribes to a slice of the admin session state. */
export function useAdminSession<T>(selector: (state: AdminSessionState) => T): T {
  return useAdminSessionState(useSessionStore(), selector);
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
        <ServicesContext.Provider value={services}>
          <ToastProvider>{children}</ToastProvider>
        </ServicesContext.Provider>
      </QueryClientProvider>
    </I18nProvider>
  );
}
