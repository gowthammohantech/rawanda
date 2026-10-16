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

import { APP_ID, DEFAULT_PERSONA_ID } from "./config.ts";

export type AppPersona = PersonaSpec;
export type AppSession = PersonaSession<AppPersona>;

/** Restores the stored persona, or signs in the app's default persona. */
export function createAppSession(storage: KeyValueStorage): AppSession {
  const create = (backing: KeyValueStorage) =>
    createPersonaSession({ storage: backing, appId: APP_ID, personas: DEMO_PERSONAS });
  let session: AppSession;
  try {
    session = create(storage);
    if (session.current() === null) session.switchTo(DEFAULT_PERSONA_ID);
  } catch {
    // Unreadable key/value store: keep the persona in memory for this run.
    session = create(createMemoryStorage());
    session.switchTo(DEFAULT_PERSONA_ID);
  }
  return session;
}
