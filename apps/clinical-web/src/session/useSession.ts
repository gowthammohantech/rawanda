/**
 * `useSession()` (CLN-01): persona, active facility, permitted facilities and `can(capability)`
 * (FND-06 `checkAccess`, role-only). Re-renders on every sign-in, switch and sign-out.
 */
import { actorForPersona, checkAccess } from "@laif/auth-demo";
import type { FacilityId } from "@laif/domain";
import { useCallback, useContext, useMemo, useSyncExternalStore } from "react";

import type { ClinicalCapability } from "./capabilities.ts";
import { SessionContext } from "./SessionProvider.tsx";
import type { AppPersona, AppSession, ClinicalSessionState } from "./session-store.ts";

export type ClinicalSessionView = {
  store: AppSession;
  state: ClinicalSessionState | null;
  persona: AppPersona | null;
  activeFacilityId: FacilityId | null;
  permittedFacilityIds: readonly FacilityId[];
  can: (capability: ClinicalCapability) => boolean;
};

const NONE: readonly FacilityId[] = Object.freeze([]);

export function useSessionStore(): AppSession {
  const store = useContext(SessionContext);
  if (store === null) throw new Error("useSession must be used inside <SessionProvider>");
  return store;
}

export function useSession(): ClinicalSessionView {
  const store = useSessionStore();
  const subscribe = useCallback((listener: () => void) => store.subscribe(listener), [store]);
  const snapshot = useCallback(() => store.state(), [store]);
  const state = useSyncExternalStore(subscribe, snapshot, snapshot);
  const persona = state?.persona ?? null;
  const actor = useMemo(() => (persona === null ? null : actorForPersona(persona)), [persona]);
  const can = useCallback(
    (capability: ClinicalCapability) => actor !== null && checkAccess(actor, capability).allowed,
    [actor],
  );
  return useMemo(
    () => ({
      store,
      state,
      persona,
      activeFacilityId: state?.activeFacilityId ?? null,
      permittedFacilityIds: state?.permittedFacilityIds ?? NONE,
      can,
    }),
    [store, state, persona, can],
  );
}
