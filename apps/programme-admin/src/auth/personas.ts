/**
 * Admin demo personas = the FND-05 `DEMO_PERSONAS` whose `appIds` include `admin` (programme
 * lead, District Alpha analyst, facility manager Alpha-1, auditor). There is no admin-only persona
 * list. Every one is labelled "DEMO PERSONA" in the UI — DEMO ROLE SWITCH, NOT AUTHENTICATION.
 */
import { DEMO_PERSONAS, type PersonaSpec } from "@laif/mock-data";

import { APP_ID } from "../app/config.ts";

export type AdminPersona = PersonaSpec;

export const ADMIN_PERSONAS: readonly AdminPersona[] = DEMO_PERSONAS.filter((persona) =>
  persona.appIds.includes(APP_ID),
);

export function findAdminPersona(personaId: string | null | undefined): AdminPersona | null {
  return ADMIN_PERSONAS.find((persona) => persona.id === personaId) ?? null;
}
