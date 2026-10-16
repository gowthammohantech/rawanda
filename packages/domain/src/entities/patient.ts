import type { ConsentState, IdentityStatus, Language, Sex } from "../enums.ts";
import type { DistrictId, FacilityId, PatientId } from "../ids.ts";
import type { PersistedEntity } from "./base.ts";

/** Tech spec §5.1 Patient + extensions. */
export type Patient = PersistedEntity & {
  id: PatientId;
  /** Synthetic, clearly fictional identifier (never a real Rwanda system ID). */
  syntheticIdentifier: string;
  displayName: string;
  /** ISO date `YYYY-MM-DD`, or null when only an estimated age is known. */
  dateOfBirth: string | null;
  // ext: HWM-04 registration without a known date of birth (FND-03 `RegisterPatientInput`).
  estimatedAgeYears?: number;
  sexOptional: Sex | null;
  facilityId: FacilityId;
  districtId: DistrictId;
  consentState: ConsentState;
  // ext: HWM-04 duplicate/match handling.
  identityStatus: IdentityStatus;
  // ext: HWM-04 possible duplicates awaiting match review.
  duplicateCandidateIds: PatientId[];
  // ext: citizen wallet / reminder language (EN ⇄ RW is P0).
  preferredLanguage: Language;
};
