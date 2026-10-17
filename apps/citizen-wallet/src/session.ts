/**
 * Demo persona session (FND-06 `createPersonaSession`, key `laif.citizen.persona`).
 * DEMO ROLE SWITCH — NOT AUTHENTICATION (RoleBanner shows the disclaimer).
 */
import {
  createMemoryStorage,
  createPersonaSession,
  type KeyValueStorage,
  type PersonaSession,
} from "@laif/auth-demo";
import { DEMO_PERSONAS, type PersonaSpec } from "@laif/mock-data";

import { APP_ID } from "./config.ts";

export type AppPersona = PersonaSpec;
export type AppSession = PersonaSession<AppPersona>;

/**
 * Restores the stored persona (CTZ-02: there is NO default persona — no stored persona means
 * signed out, and the wallet starts at the welcome screen).
 */
export function createAppSession(storage: KeyValueStorage): AppSession {
  const create = (backing: KeyValueStorage) =>
    createPersonaSession({ storage: backing, appId: APP_ID, personas: DEMO_PERSONAS });
  try {
    const session = create(storage);
    session.current();
    return session;
  } catch {
    // Unreadable key/value store: keep the persona in memory for this run.
    return create(createMemoryStorage());
  }
}
