import type { AppId, Language, Role } from "../enums.ts";
import type { DistrictId, FacilityId, PatientId, PersonaId } from "../ids.ts";
import type { PersistedEntity } from "./base.ts";

/** Demo persona (spec §5.1 `DemoPersona`). Role switching is demo-only, not security. */
export type DemoPersona = PersistedEntity & {
  id: PersonaId;
  displayName: string;
  role: Role;
  appIds: AppId[];
  /** Facilities in scope (empty = not facility-scoped, e.g. programme-wide). */
  facilityIds: FacilityId[];
  /** Districts in scope (empty = not district-scoped). */
  districtIds: DistrictId[];
  /** True for programme-wide scope (programme lead, auditor). */
  programmeWide: boolean;
  /** Pseudonymous staff code such as `HW-014`; null for citizens. */
  workerCode: string | null;
  /** Citizen personas: own / represented patient records. */
  linkedPatientIds: PatientId[];
  preferredLanguage: Language;
};
