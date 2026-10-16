import type {
  CareInstructionKind,
  CareInstructionSourceType,
  CareInstructionStatus,
} from "../enums.ts";
import type { CareInstructionId, FacilityId, PatientId, PersonaId } from "../ids.ts";
import type { IsoUtc, PersistedEntity } from "./base.ts";

/**
 * ext (new entity): the only thing the citizen wallet may show as a next step.
 * Citizen-visible progress (`planned | completed | cancelled`) is derived from the linked
 * referral/follow-up by `deriveInstructionProgress()` and never stored.
 */
export type CareInstruction = PersistedEntity & {
  id: CareInstructionId;
  patientId: PatientId;
  kind: CareInstructionKind;
  sourceType: CareInstructionSourceType;
  sourceId: string;
  /** i18n key (namespace `citizen`); the wallet renders it with `params`. */
  messageKey: string;
  params: Record<string, string | number>;
  appointmentAt: IsoUtc | null;
  facilityId: FacilityId;
  releasedBy: PersonaId;
  releasedAt: IsoUtc;
  status: CareInstructionStatus;
};
