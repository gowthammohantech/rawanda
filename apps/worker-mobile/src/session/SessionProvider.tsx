/**
 * Session provider (HWM-01 task 4): restores the demo device session once the local database is
 * open (BrandSplash meanwhile — no flash of the sign-in screen) and exposes
 * `{ session, status, signIn, signOut }`. Re-checks after a demo reset / scenario load (the
 * reset clears device sessions and the device id, so the worker signs in again).
 */
import { BrandSplash } from "@laif/ui-native";
import { useQueryClient } from "@tanstack/react-query";
import {
  createContext,
  useCallback,
  useEffect,
  useMemo,
  useState,
  useSyncExternalStore,
  type ReactNode,
} from "react";

import { useDemoTools } from "../demo-tools.tsx";
import { useRepository, useSessionStore } from "../providers.tsx";
import { createSessionRepo, type SessionStatus, type SignInResult } from "./sessionRepo.ts";
import type { SignedInSession } from "./store.ts";

export type SessionContextValue = {
  status: SessionStatus;
  session: SignedInSession | null;
  signIn: (personaId: string, facilityId: string) => Promise<SignInResult>;
  signOut: () => Promise<void>;
  /** Re-reads the device session record (HWM-10 revocation / restore). */
  refresh: () => Promise<void>;
};

export const SessionContext = createContext<SessionContextValue | null>(null);

export function SessionProvider({ children }: { children?: ReactNode }) {
  const repo = useRepository();
  const store = useSessionStore();
  const queryClient = useQueryClient();
  const { epoch } = useDemoTools();
  const sessionRepo = useMemo(() => createSessionRepo({ repo, store }), [repo, store]);
  const session = useSyncExternalStore(store.subscribe, store.current, store.current);
  const [status, setStatus] = useState<SessionStatus>("loading");

  const refresh = useCallback(async () => {
    try {
      setStatus(await sessionRepo.restore());
    } catch {
      setStatus("signed_out");
    }
  }, [sessionRepo]);

  useEffect(() => {
    let active = true;
    void sessionRepo.restore().then(
      (next) => {
        if (active) setStatus(next);
      },
      () => {
        if (active) setStatus("signed_out");
      },
    );
    return () => {
      active = false;
    };
  }, [sessionRepo, epoch]);

  const signIn = useCallback(
    async (personaId: string, facilityId: string) => {
      const result = await sessionRepo.signIn(personaId, facilityId);
      if (result.ok) {
        queryClient.clear();
        setStatus("signed_in");
      }
      return result;
    },
    [sessionRepo, queryClient],
  );

  const signOut = useCallback(async () => {
    try {
      await sessionRepo.signOut();
    } finally {
      queryClient.clear();
      setStatus("signed_out");
    }
  }, [sessionRepo, queryClient]);

  const value = useMemo<SessionContextValue>(
    () => ({
      status,
      session: status === "signed_in" || status === "revoked" ? session : null,
      signIn,
      signOut,
      refresh,
    }),
    [status, session, signIn, signOut, refresh],
  );

  if (status === "loading") return <BrandSplash />;
  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}
