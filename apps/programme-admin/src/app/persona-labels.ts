/** Translated role / scope labels of a demo persona (PersonaSwitcher, RoleBanner). */
import { roleLabelKey } from "@laif/auth-demo";
import type { PersonaOption, TranslationKey, TranslationValues } from "@laif/ui-web";

import type { AppPersona } from "./session.ts";

type Tx = (key: TranslationKey, values?: TranslationValues) => string;

export function personaScopeLabel(persona: AppPersona, t: Tx): string | undefined {
  if (persona.programmeWide) return t("shell:role.programmeWide");
  if (persona.facilityIds.length > 0) {
    return persona.facilityIds
      .map((id) => t(`demo:entity.facility.${id}` as TranslationKey))
      .join(", ");
  }
  if (persona.districtIds.length > 0) {
    return persona.districtIds
      .map((id) => t(`demo:entity.district.${id}` as TranslationKey))
      .join(", ");
  }
  return undefined;
}

export function personaOption(persona: AppPersona, t: Tx): PersonaOption {
  const scopeLabel = personaScopeLabel(persona, t);
  return {
    id: persona.id,
    name: persona.displayName,
    roleLabel: t(roleLabelKey(persona.role)),
    ...(scopeLabel === undefined ? {} : { scopeLabel }),
  };
}
