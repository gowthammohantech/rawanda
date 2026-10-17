/**
 * Facility scope of the signed-in device session (HWM-01). Every data hook reads its facility
 * from here — never from route params.
 */
import type { DistrictId, FacilityId } from "@laif/domain";

import { districtOf } from "../features/auth/labels.ts";
import { useSession } from "./useSession.ts";

export type WorkerScope = {
  facilityId: FacilityId;
  districtId: DistrictId | null;
  /** `[facilityId]` — ready for `repo.listPatients({ facilityIds })`. */
  facilityIds: readonly FacilityId[];
  personaId: string;
  deviceId: string;
};

export function scopeOfSession(
  session: { facilityId: FacilityId; persona: { id: string }; deviceId: string } | null,
): WorkerScope | null {
  if (session === null) return null;
  return {
    facilityId: session.facilityId,
    districtId: districtOf(session.facilityId),
    facilityIds: [session.facilityId],
    personaId: session.persona.id,
    deviceId: session.deviceId,
  };
}

/** Null only outside the signed-in area (the `(app)` guard guarantees a session there). */
export function useScope(): WorkerScope | null {
  return scopeOfSession(useSession().session);
}

/** For screens inside `(app)`: throws if rendered without a session (invariant). */
export function useRequiredScope(): WorkerScope {
  const scope = useScope();
  if (scope === null) throw new Error("useRequiredScope: no signed-in device session");
  return scope;
}
