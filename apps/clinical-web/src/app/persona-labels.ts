/** Translated labels of demo personas and facilities (login cards, PersonaSwitcher, RoleBanner). */
import { roleLabelKey } from "@laif/auth-demo";
import type { FacilityId } from "@laif/domain";
import type { PersonaOption, TranslationKey, TranslationValues } from "@laif/ui-web";

import { permittedFacilityIdsFor, type AppPersona } from "../session/session-store.ts";

type Tx = (key: TranslationKey, values?: TranslationValues) => string;

export function facilityLabel(id: FacilityId | string, t: Tx): string {
  return t(`demo:entity.facility.${id}` as TranslationKey);
}

/** "Demo Health Centre Alpha-1, Demo Health Centre Alpha-2" (the persona's permitted set). */
export function personaFacilitiesLabel(persona: AppPersona, t: Tx): string {
  return permittedFacilityIdsFor(persona)
    .map((id) => facilityLabel(id, t))
    .join(", ");
}

export function personaOption(persona: AppPersona, t: Tx): PersonaOption {
  const scopeLabel = personaFacilitiesLabel(persona, t);
  return {
    id: persona.id,
    name: persona.displayName,
    roleLabel: t(roleLabelKey(persona.role)),
    ...(scopeLabel === "" ? {} : { scopeLabel }),
  };
}
