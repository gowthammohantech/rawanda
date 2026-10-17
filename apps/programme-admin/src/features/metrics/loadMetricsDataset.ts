/**
 * Dataset loader (ADM-02 task 4). `assertScope` (ADM-01) runs FIRST — no read happens for a
 * district / facility outside the grant — then one scoped repository read
 * (`getMetricsRecords`: screenings, reviews, referrals, follow-ups, time entries, facilities,
 * districts, consent state) and the attribution rules of `@laif/analytics` `filterDataset`.
 *
 * Deviation from the phase text: the admin roles hold `metrics.read` but not the clinical
 * `patient.read` / `review.read` that the FND-07 `list*` methods require, so the repository
 * exposes one aggregate-permission read instead (patients reduced to non-identifying fields).
 *
 * Raw arrays never reach page components: pages consume selector outputs (`AggregateCell`s).
 */
import { filterDataset, type MetricsDataset } from "@laif/analytics";
import type { ScopePersona } from "@laif/auth-demo";
import type { AccessGrant } from "@laif/contracts";
import type { DistrictId, FacilityId } from "@laif/domain";
import type { CareRepository } from "@laif/repositories";

import { assertScope } from "../../auth/scope.ts";
import type { AdminFilters, Period } from "../filters/filterSchema.ts";

export type ScopeAccess = { persona: ScopePersona; grant: AccessGrant | null };

export type LoadedDataset = {
  dataset: MetricsDataset;
  /** Demo-clock instant of the read (the "Computed …" stamp). */
  asOf: string;
  /** Latest source write at read time (stale detection). */
  lastWriteAt: string | null;
};

export async function loadMetricsDataset(
  repo: Pick<CareRepository, "getMetricsRecords">,
  access: ScopeAccess,
  filters: AdminFilters,
  period: Period,
): Promise<LoadedDataset> {
  const districtIds = filters.district === null ? null : [filters.district];
  const facilityIds = filters.facility === null ? null : [filters.facility];
  assertScope(access.persona, access.grant, { districtIds, facilityIds });
  const result = await repo.getMetricsRecords({
    from: period.from,
    to: period.to,
    ...(districtIds === null ? {} : { districtIds: districtIds }),
    ...(facilityIds === null ? {} : { facilityIds: facilityIds }),
  });
  const dataset = filterDataset(
    result.records,
    {
      from: period.from,
      to: period.to,
      ...(districtIds === null ? {} : { districtIds: districtIds as DistrictId[] }),
      ...(facilityIds === null ? {} : { facilityIds: facilityIds as FacilityId[] }),
      type: filters.type,
    },
    new Date(result.asOf),
  );
  return { dataset, asOf: result.asOf, lastWriteAt: result.lastWriteAt };
}
