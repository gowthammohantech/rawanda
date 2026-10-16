/**
 * Aggregate programme metrics (PA, ADM-02…07) over the FND-06 calculators. Scope is enforced
 * here: requesting a district / facility outside the actor's scope → `FORBIDDEN` with an audited
 * denial (WF-04, T-02); without explicit ids the result is restricted to the actor's scope.
 */
import { getProgrammeMetrics, type ProgrammeMetrics } from "@laif/analytics";
import { MetricsFilterSchema, type MetricsFilter } from "@laif/contracts";
import type {
  District,
  DistrictId,
  Facility,
  FacilityId,
  FollowUp,
  Patient,
  Referral,
  Review,
  Screening,
} from "@laif/domain";

import type { MetricsFilterInput } from "../care-repository.ts";
import type { Engine } from "../core/engine.ts";
import { assertRequestedScope, parseFilter } from "./shared.ts";

export function createMetricsService(engine: Engine) {
  return {
    getAggregateMetrics(f?: MetricsFilterInput): Promise<ProgrammeMetrics> {
      return engine.read(async (ctx) => {
        ctx.authorize("metrics.read", undefined, { entityType: "district", entityId: "metrics" });
        const filter: MetricsFilter = parseFilter(MetricsFilterSchema, f);
        assertRequestedScope(ctx, "metrics.read", filter, { aggregate: true });
        const scope = ctx.requireActor().scope;
        const scoped: MetricsFilter = { ...filter };
        if (!filter.districtIds && !filter.facilityIds) {
          if (scope.kind === "district")
            scoped.districtIds = [...scope.districtIds] as DistrictId[];
          if (scope.kind === "facility")
            scoped.facilityIds = [...scope.facilityIds] as FacilityId[];
        }
        const data = {
          patients: await ctx.all<Patient>("patient"),
          screenings: await ctx.all<Screening>("screening"),
          reviews: await ctx.all<Review>("review"),
          referrals: await ctx.all<Referral>("referral"),
          followUps: await ctx.all<FollowUp>("follow_up"),
          facilities: await ctx.all<Facility>("facility"),
          districts: await ctx.all<District>("district"),
        };
        return getProgrammeMetrics(data, scoped, ctx.now);
      });
    },
  };
}
