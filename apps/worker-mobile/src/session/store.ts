/**
 * Device session store (HWM-01): the FND-06 persona session (`laif.worker.persona`) plus the
 * signed-in device context (`laif.worker.deviceSession`: facility, device session id, device
 * id). Synchronous, so the repository's `getActor()` can read it on every call.
 *
 * DEMO SIGN-IN — NOT AUTHENTICATION. There is no default persona: no stored session = signed out.
 */
import {
  actorForPersona,
  createMemoryStorage,
  createPersonaSession,
  type ActorContext,
  type KeyValueStorage,
  personaStorageKey,
  type PersonaSession,
} from "@laif/auth-demo";
import type { DeviceSessionId, FacilityId, Role } from "@laif/domain";
import { DEMO_PERSONAS, type PersonaSpec } from "@laif/mock-data";

import { APP_ID } from "../config.ts";

export type AppPersona = PersonaSpec;

/** Roles that may sign in to the worker app (FND-05 personas with `appIds` incl. `worker`). */
export const WORKER_ROLES: readonly Role[] = ["community_health_worker", "field_supervisor"];

export const DEVICE_SESSION_STORAGE_KEY = "laif.worker.deviceSession" as const;

export type DeviceContext = {
  facilityId: FacilityId;
  deviceSessionId: DeviceSessionId;
  deviceId: string;
};

export type SignedInSession = DeviceContext & { persona: AppPersona };

export type SessionStore = {
  /** FND-06 persona session (key `laif.worker.persona`). */
  readonly personas: PersonaSession<AppPersona>;
  /** Personas offered by the demo sign-in (worker app + CHW / supervisor roles). */
  available: () => AppPersona[];
  /** Stable snapshot (same object until the session changes). */
  current: () => SignedInSession | null;
  save: (personaId: string, context: DeviceContext) => void;
  clear: () => void;
  subscribe: (listener: () => void) => () => void;
  /** Repository actor: scope narrowed to the signed-in facility, device session attached. */
  actor: () => ActorContext | null;
};

function parseContext(raw: string | null): DeviceContext | null {
  if (raw === null) return null;
  try {
    const value = JSON.parse(raw) as Partial<DeviceContext>;
    if (
      typeof value.facilityId === "string" &&
      typeof value.deviceSessionId === "string" &&
      typeof value.deviceId === "string"
    ) {
      return value as DeviceContext;
    }
  } catch {
    // Corrupt value: treated as signed out.
  }
  return null;
}

export function createSessionStore(
  storage: KeyValueStorage,
  personaList: readonly AppPersona[] = DEMO_PERSONAS,
): SessionStore {
  let backing = storage;
  try {
    backing.getItem(DEVICE_SESSION_STORAGE_KEY);
  } catch {
    // Unreadable key/value store: keep the session in memory for this run.
    backing = createMemoryStorage();
  }
  const personas = createPersonaSession({
    storage: backing,
    appId: APP_ID,
    personas: personaList,
  });
  const listeners = new Set<() => void>();
  let cache: { persona: string | null; context: string | null; value: SignedInSession | null } = {
    persona: null,
    context: null,
    value: null,
  };

  const current = (): SignedInSession | null => {
    const personaRaw = backing.getItem(personaStorageKey(APP_ID));
    const contextRaw = backing.getItem(DEVICE_SESSION_STORAGE_KEY);
    if (cache.persona === personaRaw && cache.context === contextRaw) return cache.value;
    const persona = personas.current();
    const context = parseContext(contextRaw);
    const value =
      persona !== null &&
      context !== null &&
      WORKER_ROLES.includes(persona.role) &&
      (persona.facilityIds as readonly string[]).includes(context.facilityId)
        ? { persona, ...context }
        : null;
    cache = { persona: personaRaw, context: contextRaw, value };
    return value;
  };

  const notify = () => {
    for (const listener of [...listeners]) listener();
  };

  return {
    personas,
    available: () => personas.available().filter((p) => WORKER_ROLES.includes(p.role)),
    current,
    save(personaId, context) {
      backing.setItem(DEVICE_SESSION_STORAGE_KEY, JSON.stringify(context));
      const result = personas.switchTo(personaId);
      if (!result.ok) backing.removeItem(DEVICE_SESSION_STORAGE_KEY);
      notify();
    },
    clear() {
      backing.removeItem(DEVICE_SESSION_STORAGE_KEY);
      personas.signOut();
      notify();
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    actor() {
      const session = current();
      if (session === null) return null;
      return actorForPersona(session.persona, {
        grant: {
          personaId: session.persona.id,
          districtIds: [],
          facilityIds: [session.facilityId],
        },
        deviceSession: { id: session.deviceSessionId, status: "active" },
      });
    },
  };
}
