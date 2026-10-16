/** Fictional districts (FND-05 task 2). Every name includes "Demo"; display text via i18n. */
import { asId, type District, type DistrictId } from "@laif/domain";

/** App phases' "District A / B" means District Alpha / Beta. */
export const DISTRICT_IDS = {
  alpha: asId<DistrictId>("dist-alpha"),
  beta: asId<DistrictId>("dist-beta"),
} as const;

export const DISTRICTS_REFERENCE = [
  { id: DISTRICT_IDS.alpha, name: "Demo District Alpha", code: "DEMO-ALPHA" },
  { id: DISTRICT_IDS.beta, name: "Demo District Beta", code: "DEMO-BETA" },
] as const;

/** i18n key for a district label: `demo:entity.district.<id>`. */
export const districtLabelKey = (id: DistrictId): string => `demo:entity.district.${id}`;

export function buildDistricts(createdAt: string): District[] {
  return DISTRICTS_REFERENCE.map((d) => ({
    ...d,
    version: 1,
    createdAt,
    updatedAt: createdAt,
    synthetic: true as const,
  }));
}
