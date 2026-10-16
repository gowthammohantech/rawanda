/**
 * Demo persona session (FND-06 `createPersonaSession`, key `laif.admin.persona` in
 * localStorage). DEMO ROLE SWITCH — NOT AUTHENTICATION (RoleBanner shows the disclaimer).
 */
import {
  createMemoryStorage,
  createPersonaSession,
  type KeyValueStorage,
  type PersonaSession,
} from "@laif/auth-demo";
import { DEMO_PERSONAS, type PersonaSpec } from "@laif/mock-data";

import { APP_ID, DEFAULT_PERSONA_ID } from "./config.ts";

export type AppPersona = PersonaSpec;
export type AppSession = PersonaSession<AppPersona>;

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

/** Restores the stored persona, or signs in the app's default persona. */
export function createAppSession(storage: KeyValueStorage = browserStorage()): AppSession {
  const session = createPersonaSession({ storage, appId: APP_ID, personas: DEMO_PERSONAS });
  if (session.current() === null) session.switchTo(DEFAULT_PERSONA_ID);
  return session;
}
