/**
 * Clinical demo session (CLN-01): the FND-06 persona session (`laif.clinical.persona`) plus the
 * active facility (`laif.clinical.facility`), both in localStorage so a reload keeps them.
 * DEMO ROLE SWITCH — NOT AUTHENTICATION (RoleBanner shows the disclaimer on every screen).
 *
 * Invariant: the active facility is one of the persona's permitted facilities. A stored session
 * that violates it (stale persona id, facility outside scope, missing facility) reads as "no
 * session" and is cleared, so the guards send the user to the demo sign-in.
 */
import {
  createMemoryStorage,
  createPersonaSession,
  facilityIdsInScope,
  personaStorageKey,
  scopeForPersona,
  type KeyValueStorage,
  type PersonaSession,
} from "@laif/auth-demo";
import type { FacilityId } from "@laif/domain";
import { DEMO_PERSONAS, FACILITIES_REFERENCE, type PersonaSpec } from "@laif/mock-data";

import { APP_ID } from "../app/config.ts";

export type AppPersona = PersonaSpec;

export type ClinicalSessionState = {
  readonly persona: AppPersona;
  readonly activeFacilityId: FacilityId;
  readonly permittedFacilityIds: readonly FacilityId[];
};

export type SignInResult =
  | { ok: true; state: ClinicalSessionState }
  | { ok: false; reason: "UNKNOWN_PERSONA" | "APP_NOT_ALLOWED" | "FACILITY_NOT_PERMITTED" };

export type AppSession = {
  readonly appId: typeof APP_ID;
  /** Clinical personas selectable on the demo sign-in. */
  available(): AppPersona[];
  /** The signed-in persona (repository actor), or null. */
  current(): AppPersona | null;
  /** Persona + active facility; referentially stable between changes (useSyncExternalStore). */
  state(): ClinicalSessionState | null;
  signIn(personaId: string, facilityId: string): SignInResult;
  /** Switches the active facility among the permitted ones; false when not permitted. */
  setActiveFacility(facilityId: string): boolean;
  signOut(): void;
  subscribe(listener: () => void): () => void;
};

export const FACILITY_STORAGE_KEY = `laif.${APP_ID}.facility` as const;

/** Facilities the persona may work in (FND-06 scope over the seed facilities). */
export function permittedFacilityIdsFor(
  persona: Pick<
    AppPersona,
    "role" | "facilityIds" | "districtIds" | "programmeWide" | "linkedPatientIds"
  >,
): FacilityId[] {
  return facilityIdsInScope(scopeForPersona(persona), FACILITIES_REFERENCE);
}

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

/** Restores the stored session (no default sign-in: no session → demo sign-in page). */
export function createAppSession(storage: KeyValueStorage = browserStorage()): AppSession {
  const personas: PersonaSession<AppPersona> = createPersonaSession({
    storage,
    appId: APP_ID,
    personas: DEMO_PERSONAS,
  });
  const listeners = new Set<() => void>();
  const notify = (): void => {
    for (const listener of [...listeners]) listener();
  };
  personas.subscribe(notify);

  let cached: ClinicalSessionState | null = null;

  const clearSilently = (): void => {
    storage.removeItem(personaStorageKey(APP_ID));
    storage.removeItem(FACILITY_STORAGE_KEY);
  };

  const state = (): ClinicalSessionState | null => {
    const persona = personas.current();
    const facility = storage.getItem(FACILITY_STORAGE_KEY);
    if (persona === null) {
      if (facility !== null) storage.removeItem(FACILITY_STORAGE_KEY);
      cached = null;
      return null;
    }
    const permitted = permittedFacilityIdsFor(persona);
    const active = permitted.find((id) => id === facility);
    if (active === undefined) {
      // Invariant violated (e.g. after a reset or a scope change): no session.
      clearSilently();
      cached = null;
      return null;
    }
    if (cached?.persona.id !== persona.id || cached.activeFacilityId !== active) {
      cached = { persona, activeFacilityId: active, permittedFacilityIds: permitted };
    }
    return cached;
  };

  return {
    appId: APP_ID,
    available: () => personas.available(),
    current: () => state()?.persona ?? null,
    state,
    signIn(personaId, facilityId) {
      const persona = personas.available().find((p) => p.id === personaId);
      if (persona === undefined) {
        return {
          ok: false,
          reason: DEMO_PERSONAS.some((p) => p.id === personaId)
            ? "APP_NOT_ALLOWED"
            : "UNKNOWN_PERSONA",
        };
      }
      if (!permittedFacilityIdsFor(persona).some((id) => id === facilityId)) {
        return { ok: false, reason: "FACILITY_NOT_PERMITTED" };
      }
      storage.setItem(FACILITY_STORAGE_KEY, facilityId);
      personas.switchTo(persona.id); // notifies
      const next = state();
      return next === null
        ? { ok: false, reason: "FACILITY_NOT_PERMITTED" }
        : { ok: true, state: next };
    },
    setActiveFacility(facilityId) {
      const current = state();
      if (current === null || !current.permittedFacilityIds.some((id) => id === facilityId)) {
        return false;
      }
      if (current.activeFacilityId === facilityId) return true;
      storage.setItem(FACILITY_STORAGE_KEY, facilityId);
      notify();
      return true;
    },
    signOut() {
      storage.removeItem(FACILITY_STORAGE_KEY);
      personas.signOut(); // notifies
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
  };
}
