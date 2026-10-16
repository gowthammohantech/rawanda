import type { DeviceSessionStatus } from "../enums.ts";
import type { DeviceId, DeviceSessionId, FacilityId, PersonaId } from "../ids.ts";
import type { PersistedEntity } from "./base.ts";

/** ext (new entity): worker device session; revocation blocks the sync queue (HWM-10). */
export type DeviceSession = PersistedEntity & {
  id: DeviceSessionId;
  personaId: PersonaId;
  deviceId: DeviceId;
  facilityId: FacilityId;
  status: DeviceSessionStatus;
};
