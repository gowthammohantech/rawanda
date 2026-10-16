import type { FacilityKind } from "../enums.ts";
import type { DistrictId, FacilityId } from "../ids.ts";
import type { PersistedEntity } from "./base.ts";

/** Fictional facility; every name includes "Demo" (FND-05). */
export type Facility = PersistedEntity & {
  id: FacilityId;
  name: string;
  /** Short display code, e.g. `ALPHA-1`. */
  code: string;
  kind: FacilityKind;
  districtId: DistrictId;
};
