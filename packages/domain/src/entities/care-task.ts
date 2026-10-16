import type { CareTaskKind, CareTaskStatus, EntityType } from "../enums.ts";
import type {
  CareTaskId,
  FacilityId,
  FollowUpId,
  PatientId,
  PersonaId,
  ReferralId,
} from "../ids.ts";
import type { IsoUtc, JsonValue, PersistedEntity } from "./base.ts";

export type FollowUpAssignmentPayload = {
  followUpId: FollowUpId;
  referralId: ReferralId | null;
};

export type CorrectionRequestPayload = {
  targetType: EntityType;
  targetId: string;
  description: string;
  suggestedValue: JsonValue;
};

export type CallbackRequestPayload = {
  topic: string;
  /** Preferred contact window, e.g. `morning` / `afternoon` (free key, i18n in UI). */
  window: string;
  note: string;
};

export type ProgrammeActionPayload = {
  actionKey: string;
  note: string;
};

export type DataQualityPayload = {
  issueCode: string;
  targetType: EntityType;
  targetId: string;
  note: string;
};

/** Payload type for each care task kind. */
export type CareTaskPayloadByKind = {
  follow_up_assignment: FollowUpAssignmentPayload;
  correction_request: CorrectionRequestPayload;
  callback_request: CallbackRequestPayload;
  programme_action: ProgrammeActionPayload;
  data_quality: DataQualityPayload;
};

type CareTaskBase = PersistedEntity & {
  id: CareTaskId;
  status: CareTaskStatus;
  patientId: PatientId | null;
  facilityId: FacilityId | null;
  assignedToId: PersonaId | null;
  createdBy: PersonaId;
  dueAt: IsoUtc | null;
  completedAt: IsoUtc | null;
  cancelled: { reason: string } | null;
};

/** ext (new entity): work items across apps, payload discriminated by `kind`. */
export type CareTask = {
  [K in CareTaskKind]: CareTaskBase & { kind: K; payload: CareTaskPayloadByKind[K] };
}[CareTaskKind];
