/**
 * Native providers (FND-10 order): I18nProvider > SafeAreaProvider > ToastProvider, then
 * QueryClientProvider and PersonaProvider (the synchronous device session store). The
 * RepositoryProvider and the HWM-01 SessionProvider are mounted by `Boot` once the local database
 * is open and seeded.
 */
import { I18nProvider } from "@laif/i18n";
import type { CareRepository } from "@laif/repositories";
import { ToastProvider } from "@laif/ui-native";
import { QueryClientProvider } from "@tanstack/react-query";
import { createContext, useContext, type ReactNode } from "react";
import {
  initialWindowMetrics,
  SafeAreaProvider,
  type Metrics,
} from "react-native-safe-area-context";

import type { DeviceClockStore } from "./demo/clockDrift.ts";
import type { ShellServices } from "./services.ts";
import type { SessionStore } from "./session/store.ts";

const RepositoryContext = createContext<CareRepository | null>(null);
const SessionStoreContext = createContext<SessionStore | null>(null);
const DeviceClockContext = createContext<DeviceClockStore | null>(null);

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
  session: SessionStore;
  children?: ReactNode;
}) {
  return <SessionStoreContext.Provider value={session}>{children}</SessionStoreContext.Provider>;
}

export function useRepository(): CareRepository {
  const repo = useContext(RepositoryContext);
  if (repo === null) throw new Error("useRepository must be used inside <RepositoryProvider>");
  return repo;
}

/** The synchronous device session store (repository actor). Screens use `useSession()`. */
export function useSessionStore(): SessionStore {
  const store = useContext(SessionStoreContext);
  if (store === null) throw new Error("useSessionStore must be used inside <PersonaProvider>");
  return store;
}

/** HWM-10 simulated device clock (offset + detected drift). */
export function useDeviceClockStore(): DeviceClockStore {
  const store = useContext(DeviceClockContext);
  if (store === null) throw new Error("useDeviceClockStore must be used inside <AppProviders>");
  return store;
}

export type AppProvidersProps = {
  services: ShellServices;
  /** Test seam (jsdom cannot measure insets). */
  safeAreaMetrics?: Metrics | null;
  children?: ReactNode;
};

export function AppProviders({
  services,
  safeAreaMetrics = initialWindowMetrics,
  children,
}: AppProvidersProps) {
  return (
    <I18nProvider i18n={services.i18n}>
      <SafeAreaProvider initialMetrics={safeAreaMetrics}>
        <ToastProvider>
          <QueryClientProvider client={services.queryClient}>
            <DeviceClockContext.Provider value={services.deviceClock}>
              <PersonaProvider session={services.session}>{children}</PersonaProvider>
            </DeviceClockContext.Provider>
          </QueryClientProvider>
        </ToastProvider>
      </SafeAreaProvider>
    </I18nProvider>
  );
}
