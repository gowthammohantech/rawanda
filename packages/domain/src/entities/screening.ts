import type {
  AmendableScreeningField,
  GlucoseContext,
  GlucoseUnit,
  ScreeningSource,
  ScreeningStatus,
} from "../enums.ts";
import type {
  DistrictId,
  FacilityId,
  PatientId,
  PersonaId,
  ScreeningAmendmentId,
  ScreeningId,
} from "../ids.ts";
import type { FlagResult } from "../rules/types.ts";
import type { IsoUtc, PersistedEntity } from "./base.ts";

export type ScreeningObservation = {
  code: string;
  value: string | number | boolean;
  unit: string | null;
};

/** Value types an amendment can carry for the amendable fields. */
export type AmendableValue = number | string | null;

/** Append-only correction record; the original screening fields are never overwritten. */
export type ScreeningAmendment = {
  id: ScreeningAmendmentId;
  field: AmendableScreeningField;
  /** Effective value immediately before this amendment. */
  before: AmendableValue;
  after: AmendableValue;
  reason: string;
  amendedBy: PersonaId;
  amendedAt: IsoUtc;
};

/** Tech spec §5.1 Screening + extensions. */
export type Screening = PersistedEntity & {
  id: ScreeningId;
  patientId: PatientId;
  workerId: PersonaId;
  facilityId: FacilityId;
  // ext: district scope for admin analytics / WF-04 scope checks.
  districtId: DistrictId;
  measuredAt: IsoUtc;
  systolic: number | null;
  diastolic: number | null;
  glucoseValue: number | null;
  // ext (nullability): null allowed only in `draft` / imported records — models the
  // *missing unit* scenario.
  glucoseUnit: GlucoseUnit | null;
  glucoseContext: GlucoseContext | null;
  observations: ScreeningObservation[];
  source: ScreeningSource;
  rulesetVersion: string | null;
  status: ScreeningStatus;
  // ext: result of `evaluateScreening` at submission (null while draft).
  flag: FlagResult | null;
  // ext: offline idempotency (HW-04, sync queue).
  clientMutationId: string;
  // ext: HW capture-time metric.
  captureDurationSeconds: number | null;
  // ext: free-text worker notes.
  notes: string;
  // ext: append-only corrections (CLN-04, HWM-06); see `applyAmendment`.
  amendments: ScreeningAmendment[];
};
