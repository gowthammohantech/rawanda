/**
 * Admin demo session (ADM-01 task 5): a Zustand view over the FND-06 persona session
 * (`createPersonaSession({ appId: 'admin' })`, key `laif.admin.persona`) plus the chosen
 * reporting scope and the AccessGrant it was granted under (`grantId`, `grantVersion`).
 *
 * Session state is UI state, never stored in the repository. Only ids, timestamps and the grant
 * (no patient data) are kept in `localStorage` (`laif.admin.session`) so a reload keeps the demo
 * session. The grant is re-validated on every navigation (`revalidate`): a grant edit (ADM-08)
 * bumps its version and the new scope applies at once; a removed grant ends the session.
 *
 * DEMO ROLE SWITCH — NOT AUTHENTICATION.
 */
import {
  actorForPersona,
  createMemoryStorage,
  isGrantExpired,
  createPersonaSession,
  type ActorContext,
  type KeyValueStorage,
  type PersonaSession,
} from "@laif/auth-demo";
import { AccessGrantSchema, type AccessGrant } from "@laif/contracts";
import type { CorrelationId, DistrictId, PersonaId } from "@laif/domain";
import { DEMO_PERSONAS } from "@laif/mock-data";
import { useStore } from "zustand";
import { createStore, type StoreApi } from "zustand/vanilla";

import { APP_ID } from "../app/config.ts";
import { createOnceRegistry, type OnceRegistry } from "../lib/idempotency.ts";
import { findAdminPersona, type AdminPersona } from "./personas.ts";

export const SESSION_STORAGE_KEY = "laif.admin.session" as const;

export type AdminSession = {
  personaId: PersonaId;
  grantId: string;
  grantVersion: number;
  /** UTC ISO (demo clock). */
  startedAt: string;
  correlationId: CorrelationId;
  /** Chosen reporting scope: one district, or null = all districts in the grant. */
  reportingDistrictId: DistrictId | null;
  /**
   * ADM-08 access simulator "Try it": the persona that started the simulated session, offered
   * by the "Return to …" banner (absent / null for a normal sign-in).
   */
  returnToPersonaId?: PersonaId | null;
  /**
   * ADM-09 (T-09) "Expire session now": the session is expired. Repository calls no longer carry
   * an actor; the next navigation or failing query / mutation redirects to the sign-in.
   */
  expired?: boolean;
};

export type AdminSessionState = {
  session: AdminSession | null;
  persona: AdminPersona | null;
  grant: AccessGrant | null;
  /** Bumped when re-validation applied a newer grant version (shell shows a notice). */
  grantChanges: number;
  /** ADM-09: a query / mutation failed after the session expired → redirect now. */
  expiryNoticed: boolean;
};

export type SignInInput = {
  persona: AdminPersona;
  grant: AccessGrant;
  reportingDistrictId: DistrictId | null;
  startedAt: string;
  correlationId: CorrelationId;
  returnToPersonaId?: PersonaId | null;
};

export type RevalidateResult = "unchanged" | "updated" | "revoked";

export type AdminSessionStore = {
  readonly store: StoreApi<AdminSessionState>;
  readonly personaSession: PersonaSession<AdminPersona>;
  /** De-duplicates side effects such as `access.denied` per navigation. */
  readonly once: OnceRegistry;
  getState(): AdminSessionState;
  signIn(input: SignInInput): AdminSession;
  signOut(): void;
  /**
   * Checks the session against the current grants (every navigation): a newer version applies
   * at once; a removed grant — or one whose `validTo` has passed (`nowIso`, ADM-08 revoke) —
   * ends the session.
   */
  revalidate(grants: readonly AccessGrant[], nowIso?: string): RevalidateResult;
  /** FND-06 actor of the signed-in persona, scope from its grant (null when signed out). */
  actor(): ActorContext | null;
  /** ADM-09: marks the session expired (persisted; other tabs follow via `storage` events). */
  expire(): void;
  /** ADM-09: a call failed while expired (RequireSession redirects at once). */
  noticeExpiry(): void;
};

const SIGNED_OUT: AdminSessionState = {
  session: null,
  persona: null,
  grant: null,
  grantChanges: 0,
  expiryNoticed: false,
};

/** `localStorage`, or an in-memory fallback when site data is blocked (private mode). */
export function browserStorage(): KeyValueStorage {
  try {
    const storage = window.localStorage;
    const probe = "laif.__probe";
    storage.setItem(probe, "1");
    storage.removeItem(probe);
    return storage;
  } catch {
    return createMemoryStorage();
  }
}

type Persisted = { session: AdminSession; grant: unknown };

function restore(
  storage: KeyValueStorage,
  personaSession: PersonaSession<AdminPersona>,
): AdminSessionState {
  const persona = personaSession.current();
  const raw = storage.getItem(SESSION_STORAGE_KEY);
  if (persona === null || raw === null) return SIGNED_OUT;
  try {
    const parsed = JSON.parse(raw) as Persisted;
    const grant = AccessGrantSchema.parse(parsed.grant);
    const { session } = parsed;
    if (session.personaId !== persona.id || grant.personaId !== persona.id) return SIGNED_OUT;
    return { session, persona, grant, grantChanges: 0, expiryNoticed: false };
  } catch {
    return SIGNED_OUT;
  }
}

export function createAdminSessionStore(
  storage: KeyValueStorage = browserStorage(),
): AdminSessionStore {
  const personaSession: PersonaSession<AdminPersona> = createPersonaSession<AdminPersona>({
    storage,
    appId: APP_ID,
    personas: DEMO_PERSONAS,
  });
  const initial = restore(storage, personaSession);
  if (initial.session === null) {
    storage.removeItem(SESSION_STORAGE_KEY);
    personaSession.signOut();
  }
  const store = createStore<AdminSessionState>(() => initial);

  const persist = (session: AdminSession, grant: AccessGrant): void => {
    try {
      storage.setItem(SESSION_STORAGE_KEY, JSON.stringify({ session, grant } satisfies Persisted));
    } catch {
      // Storage blocked: the session still lives in memory.
    }
  };

  const signOut = (): void => {
    storage.removeItem(SESSION_STORAGE_KEY);
    personaSession.signOut();
    store.setState(SIGNED_OUT, true);
  };

  return {
    store,
    personaSession,
    once: createOnceRegistry(),
    getState: () => store.getState(),
    signIn(input) {
      const { persona, grant } = input;
      if (findAdminPersona(persona.id) === null || grant.personaId !== persona.id) {
        throw new RangeError(`not an admin persona/grant pair: ${persona.id} / ${grant.id}`);
      }
      const switched = personaSession.switchTo(persona.id);
      if (!switched.ok) throw new RangeError(`persona not allowed in admin: ${persona.id}`);
      const session: AdminSession = {
        personaId: persona.id,
        grantId: grant.id,
        grantVersion: grant.version,
        startedAt: input.startedAt,
        correlationId: input.correlationId,
        reportingDistrictId: input.reportingDistrictId,
        ...(input.returnToPersonaId ? { returnToPersonaId: input.returnToPersonaId } : {}),
      };
      persist(session, grant);
      store.setState({ session, persona, grant, grantChanges: 0, expiryNoticed: false }, true);
      return session;
    },
    signOut,
    revalidate(grants, nowIso) {
      const { session, grant: current } = store.getState();
      if (session === null) return "unchanged";
      const grant = grants.find((g) => g.id === session.grantId);
      if (
        !grant ||
        grant.personaId !== session.personaId ||
        (nowIso !== undefined && isGrantExpired(grant, nowIso))
      ) {
        signOut();
        return "revoked";
      }
      if (current !== null && grant.version === session.grantVersion) return "unchanged";
      const next: AdminSession = {
        ...session,
        grantVersion: grant.version,
        // A reporting district no longer in the grant falls back to "all in my scope".
        reportingDistrictId:
          session.reportingDistrictId !== null &&
          grant.districtIds.includes(session.reportingDistrictId)
            ? session.reportingDistrictId
            : null,
      };
      persist(next, grant);
      store.setState((state) => ({
        ...state,
        session: next,
        grant,
        grantChanges: state.grantChanges + 1,
      }));
      return "updated";
    },
    actor() {
      const { persona, grant, session } = store.getState();
      if (persona === null || session?.expired === true) return null;
      return actorForPersona(persona, { grant });
    },
    expire() {
      const { session, grant } = store.getState();
      if (session === null || grant === null || session.expired === true) return;
      const next: AdminSession = { ...session, expired: true };
      persist(next, grant);
      store.setState((state) => ({ ...state, session: next }));
    },
    noticeExpiry() {
      const { session, expiryNoticed } = store.getState();
      if (session?.expired === true && !expiryNoticed) {
        store.setState((state) => ({ ...state, expiryNoticed: true }));
      }
    },
  };
}

/**
 * Other tabs of the same browser (ADM-09): an expiry or sign-out there applies here too (same
 * `localStorage` session). Returns the unsubscribe function.
 */
export function followOtherTabs(session: AdminSessionStore): () => void {
  if (typeof window === "undefined") return () => undefined;
  const onStorage = (event: StorageEvent) => {
    if (event.key !== SESSION_STORAGE_KEY) return;
    const current = session.getState().session;
    if (current === null) return;
    if (event.newValue === null) {
      session.signOut();
      return;
    }
    try {
      const parsed = JSON.parse(event.newValue) as Persisted;
      if (parsed.session.correlationId === current.correlationId && parsed.session.expired) {
        session.expire();
      }
    } catch {
      // Ignore malformed values.
    }
  };
  window.addEventListener("storage", onStorage);
  return () => window.removeEventListener("storage", onStorage);
}

/** React binding: `useAdminSessionState(services.session, (s) => s.persona)`. */
export function useAdminSessionState<T>(
  session: AdminSessionStore,
  selector: (state: AdminSessionState) => T,
): T {
  return useStore(session.store, selector);
}
