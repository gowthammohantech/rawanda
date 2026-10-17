/**
 * Native providers (FND-10 order): I18nProvider > SafeAreaProvider > ToastProvider, then
 * QueryClientProvider and PersonaProvider. The `CitizenRepoProvider` (`src/data/repo.tsx`) is
 * mounted by `Boot` once the local database is open and seeded.
 */
import { I18nProvider } from "@laif/i18n";
import { ToastProvider } from "@laif/ui-native";
import { QueryClientProvider } from "@tanstack/react-query";
import {
  createContext,
  useCallback,
  useContext,
  useSyncExternalStore,
  type ReactNode,
} from "react";
import {
  initialWindowMetrics,
  SafeAreaProvider,
  type Metrics,
} from "react-native-safe-area-context";

import { useStore } from "zustand";

import type { ShellServices } from "./services.ts";
import type { AppPersona, AppSession } from "./session.ts";
import type { WalletState, WalletStore } from "./state/session.ts";

const SessionContext = createContext<AppSession | null>(null);
const WalletContext = createContext<WalletStore | null>(null);

export function useWalletStore(): WalletStore {
  const store = useContext(WalletContext);
  if (store === null) throw new Error("useWalletStore must be used inside <AppProviders>");
  return store;
}

/** Selects from the CTZ-02 wallet session store (re-renders on change). */
export function useWallet<T>(selector: (state: WalletState) => T): T {
  return useStore(useWalletStore(), selector);
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
            <PersonaProvider session={services.session}>
              <WalletContext.Provider value={services.wallet}>{children}</WalletContext.Provider>
            </PersonaProvider>
          </QueryClientProvider>
        </ToastProvider>
      </SafeAreaProvider>
    </I18nProvider>
  );
}
