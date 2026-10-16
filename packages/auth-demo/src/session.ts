/**
 * Persona session store (FND-06 task 5) with injected storage. Persists only the selected
 * persona id under `laif.<appId>.persona` — never patient data.
 *
 * DEMO ROLE SWITCH — NOT AUTHENTICATION. Every UI that uses this store must show the RoleBanner
 * text `demo:roleSwitchDisclaimer` (enforced by the ui components, FND-09/10).
 */
import type { AppId, DemoPersona } from "@laif/domain";

/**
 * Synchronous key/value storage. `window.localStorage` matches it directly; native apps pass the
 * sync API of `expo-sqlite/kv-store` (`getItemSync` …) through a 3-line adapter.
 */
export interface KeyValueStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

export interface MemoryKeyValueStorage extends KeyValueStorage {
  /** Snapshot of everything stored (tests). */
  entries(): Record<string, string>;
}

export function createMemoryStorage(initial: Record<string, string> = {}): MemoryKeyValueStorage {
  const data = new Map(Object.entries(initial));
  return {
    getItem: (key) => data.get(key) ?? null,
    setItem: (key, value) => {
      data.set(key, value);
    },
    removeItem: (key) => {
      data.delete(key);
    },
    entries: () => Object.fromEntries(data),
  };
}

export const ROLE_SWITCH_DISCLAIMER_KEY = "demo:roleSwitchDisclaimer" as const;
export const ROLE_SWITCH_DISCLAIMER_EN = "Demo role switch — not authentication" as const;

export function personaStorageKey(appId: AppId): `laif.${AppId}.persona` {
  return `laif.${appId}.persona`;
}

export type SessionPersona = Pick<DemoPersona, "id" | "appIds">;

export type SwitchResult<P extends SessionPersona> =
  { ok: true; persona: P } | { ok: false; reason: "UNKNOWN_PERSONA" | "APP_NOT_ALLOWED" };

export type PersonaSession<P extends SessionPersona> = {
  readonly appId: AppId;
  /** i18n key the RoleBanner must render. */
  readonly disclaimerKey: typeof ROLE_SWITCH_DISCLAIMER_KEY;
  /** Personas selectable in this app (`persona.appIds` includes `appId`). */
  available(): P[];
  /** The persisted persona, or null (none stored, or a stale/unknown/disallowed id). */
  current(): P | null;
  switchTo(personaId: string): SwitchResult<P>;
  signOut(): void;
  /** Called after every change with the new current persona. Returns an unsubscribe. */
  subscribe(listener: (persona: P | null) => void): () => void;
};

export type CreatePersonaSessionOptions<P extends SessionPersona> = {
  storage: KeyValueStorage;
  appId: AppId;
  personas: readonly P[];
};

export function createPersonaSession<P extends SessionPersona>(
  options: CreatePersonaSessionOptions<P>,
): PersonaSession<P> {
  const { storage, appId, personas } = options;
  const key = personaStorageKey(appId);
  const listeners = new Set<(persona: P | null) => void>();
  const allowed = (p: P): boolean => p.appIds.includes(appId);

  const notify = (persona: P | null): void => {
    for (const listener of [...listeners]) listener(persona);
  };

  const current = (): P | null => {
    const stored = storage.getItem(key);
    if (stored === null) return null;
    const persona = personas.find((p) => p.id === stored);
    if (persona && allowed(persona)) return persona;
    // Stale value (e.g. after a reset or a persona removed): clear it.
    storage.removeItem(key);
    return null;
  };

  return {
    appId,
    disclaimerKey: ROLE_SWITCH_DISCLAIMER_KEY,
    available: () => personas.filter(allowed),
    current,
    switchTo(personaId) {
      const persona = personas.find((p) => p.id === personaId);
      if (!persona) return { ok: false, reason: "UNKNOWN_PERSONA" };
      if (!allowed(persona)) return { ok: false, reason: "APP_NOT_ALLOWED" };
      storage.setItem(key, persona.id);
      notify(persona);
      return { ok: true, persona };
    },
    signOut() {
      storage.removeItem(key);
      notify(null);
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
  };
}
