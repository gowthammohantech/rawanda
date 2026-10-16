/** Fictional facilities (FND-05 task 2). App phases' "Facility A1 / A2 / B1" = Alpha-1 / Alpha-2 / Beta-1. */
import { asId, type Facility, type FacilityId } from "@laif/domain";

import { DISTRICT_IDS } from "./districts.ts";

export const FACILITY_IDS = {
  alpha1: asId<FacilityId>("fac-alpha-1"),
  alpha2: asId<FacilityId>("fac-alpha-2"),
  beta1: asId<FacilityId>("fac-beta-1"),
} as const;

export const FACILITIES_REFERENCE = [
  {
    id: FACILITY_IDS.alpha1,
    name: "Demo Health Centre Alpha-1",
    code: "ALPHA-1",
    kind: "health_centre",
    districtId: DISTRICT_IDS.alpha,
  },
  {
    id: FACILITY_IDS.alpha2,
    name: "Demo Health Centre Alpha-2",
    code: "ALPHA-2",
    kind: "health_centre",
    districtId: DISTRICT_IDS.alpha,
  },
  {
    id: FACILITY_IDS.beta1,
    name: "Demo District Hospital Beta-1",
    code: "BETA-1",
    kind: "district_hospital",
    districtId: DISTRICT_IDS.beta,
  },
] as const satisfies readonly Omit<Facility, "version" | "createdAt" | "updatedAt" | "synthetic">[];

/** facilityId → districtId (scope checks in FND-06 take this map). */
export const FACILITY_TO_DISTRICT: Readonly<
  Record<string, (typeof DISTRICT_IDS)[keyof typeof DISTRICT_IDS]>
> = Object.fromEntries(FACILITIES_REFERENCE.map((f) => [f.id, f.districtId]));

/** i18n key for a facility label: `demo:entity.facility.<id>`. */
export const facilityLabelKey = (id: FacilityId): string => `demo:entity.facility.${id}`;

export function buildFacilities(createdAt: string): Facility[] {
  return FACILITIES_REFERENCE.map((f) => ({
    ...f,
    version: 1,
    createdAt,
    updatedAt: createdAt,
    synthetic: true as const,
  }));
}
