/** Translated role / scope labels of an admin persona, its grant and the reporting scope. */
import { roleLabelKey } from "@laif/auth-demo";
import type { AccessGrant } from "@laif/contracts";
import type { PersonaOption, TranslationKey, TranslationValues } from "@laif/ui-web";

import type { AdminPersona } from "../auth/personas.ts";
import { grantDistrictIds, grantFacilityIds, type ScopeRequest } from "../auth/scope.ts";
import type { AdminSession } from "../auth/sessionStore.ts";

export type Tx = (key: TranslationKey, values?: TranslationValues) => string;

export const districtLabel = (id: string, t: Tx): string =>
  t(`demo:entity.district.${id}` as TranslationKey);
export const facilityLabel = (id: string, t: Tx): string =>
  t(`demo:entity.facility.${id}` as TranslationKey);

const list = (items: string[]): string => items.join(", ");

/** "Districts: Alpha, Beta" / "Facilities: Alpha-1" — what the grant covers. */
export function grantScopeSummary(persona: AdminPersona, grant: AccessGrant | null, t: Tx): string {
  const districts = grantDistrictIds(persona, grant);
  if (districts.length > 0) {
    return t("admin:auth.scopeSummary.districts", {
      list: list(districts.map((id) => districtLabel(id, t))),
    });
  }
  return t("admin:auth.scopeSummary.facilities", {
    list: list(grantFacilityIds(persona, grant).map((id) => facilityLabel(id, t))),
  });
}

/** Short scope label: district or facility names, or "All districts in my scope (…)". */
export function grantScopeLabel(persona: AdminPersona, grant: AccessGrant | null, t: Tx): string {
  const districts = grantDistrictIds(persona, grant);
  if (districts.length > 1) {
    return t("admin:shell.scope.allDistricts", {
      list: list(districts.map((id) => districtLabel(id, t))),
    });
  }
  if (districts.length === 1) return districtLabel(districts[0] ?? "", t);
  return list(grantFacilityIds(persona, grant).map((id) => facilityLabel(id, t)));
}

/** The scope the user is looking at: URL scope first, then the session's reporting scope. */
export function reportingScopeLabel(
  persona: AdminPersona,
  grant: AccessGrant | null,
  session: AdminSession | null,
  request: ScopeRequest,
  t: Tx,
): string {
  if (request.facilityId !== null) return facilityLabel(request.facilityId, t);
  if (request.districtId !== null) return districtLabel(request.districtId, t);
  if (session?.reportingDistrictId) return districtLabel(session.reportingDistrictId, t);
  return grantScopeLabel(persona, grant, t);
}

export function personaOption(persona: AdminPersona, t: Tx, scopeLabel?: string): PersonaOption {
  return {
    id: persona.id,
    name: persona.displayName,
    roleLabel: t(roleLabelKey(persona.role)),
    ...(scopeLabel === undefined ? {} : { scopeLabel }),
  };
}
