/**
 * Attributable actor labels (CLN-04): FND-05 demo personas (synthetic names) by id — author of an
 * amendment, recording worker of a screening, actor of a follow-up timeline event.
 */
import { roleLabelKey } from "@laif/auth-demo";
import { DEMO_PERSONAS, type PersonaSpec } from "@laif/mock-data";
import type { TranslationKey, TranslationValues } from "@laif/ui-web";

type Tx = (key: TranslationKey, values?: TranslationValues) => string;

const BY_ID: ReadonlyMap<string, PersonaSpec> = new Map(DEMO_PERSONAS.map((p) => [p.id, p]));

export function personaById(id: string | null | undefined): PersonaSpec | null {
  if (id === null || id === undefined) return null;
  return BY_ID.get(id) ?? null;
}

/** "Zorvel Quorandi" (unknown ids are shown as-is: never silently dropped). */
export function personaName(id: string | null | undefined): string | null {
  if (id === null || id === undefined) return null;
  return personaById(id)?.displayName ?? id;
}

/** "Zorvel Quorandi · Clinician" */
export function personaNameAndRole(id: string, t: Tx): string {
  const persona = personaById(id);
  if (persona === null) return id;
  return `${persona.displayName} · ${t(roleLabelKey(persona.role))}`;
}
