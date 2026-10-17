/** Translated facility / district names of a worker persona (fictional demo entities). */
import type { DistrictId, FacilityId } from "@laif/domain";
import { FACILITY_TO_DISTRICT } from "@laif/mock-data";
import type { TranslationKey, TranslationValues } from "@laif/ui-native";

type Tx = (key: TranslationKey, values?: TranslationValues) => string;

export const facilityName = (id: FacilityId | string, t: Tx): string =>
  t(`demo:entity.facility.${id}` as TranslationKey);

export function districtOf(facilityId: FacilityId | string): DistrictId | null {
  const districtId: DistrictId | undefined = FACILITY_TO_DISTRICT[facilityId];
  return districtId ?? null;
}

export const districtName = (id: DistrictId | string, t: Tx): string =>
  t(`demo:entity.district.${id}` as TranslationKey);

/** Distinct district names of a list of facilities, in order. */
export function districtNames(facilityIds: readonly string[], t: Tx): string[] {
  const ids = [...new Set(facilityIds.map(districtOf).filter((d): d is DistrictId => d !== null))];
  return ids.map((id) => districtName(id, t));
}
