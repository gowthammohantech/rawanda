import { filterDataset, type MetricsDataset } from "@laif/analytics";
import type { DistrictId, FacilityId } from "@laif/domain";

/** The dataset restricted to districts / facilities (same period, type and clock). */
export function restrictDataset(
  ds: MetricsDataset,
  scope: { districtIds?: string[]; facilityIds?: string[] },
): MetricsDataset {
  return filterDataset(
    ds.cohort,
    {
      ...(ds.filter.from === null ? {} : { from: ds.filter.from }),
      ...(ds.filter.to === null ? {} : { to: ds.filter.to }),
      ...(scope.districtIds === undefined
        ? {}
        : { districtIds: scope.districtIds as DistrictId[] }),
      ...(scope.facilityIds === undefined
        ? {}
        : { facilityIds: scope.facilityIds as FacilityId[] }),
      type: ds.filter.type,
    },
    new Date(ds.nowIso),
  );
}
