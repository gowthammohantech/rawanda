/**
 * Aggregate programme metrics (PA, ADM-02…07) over the FND-06 calculators. Scope is enforced
 * here: requesting a district / facility outside the actor's scope → `FORBIDDEN` with an audited
 * denial (WF-04, T-02); without explicit ids the result is restricted to the actor's scope.
 */
import {
  applyMetricsFilter,
  isDayInRange,
  getProgrammeMetrics,
  type MetricsRecords,
  type ProgrammeMetrics,
} from "@laif/analytics";
import {
  MetricsFilterSchema,
  TimeEntrySchema,
  type MetricsFilter,
  type TimeEntry,
} from "@laif/contracts";
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
import type { Engine, TxContext } from "../core/engine.ts";
import { assertRequestedScope, parseFilter } from "./shared.ts";

/**
 * ADM-02 dataset read: the scoped rows the admin metric layer computes on. Patients are reduced
 * to what the calculators read (no names, identifiers or dates of birth leave the repository).
 */
export type MetricsRecordsResult = {
  records: MetricsRecords;
  /** Demo-clock instant of the read (ISO UTC). */
  asOf: string;
  /** Latest `updatedAt` of any metric source record (stale detection). */
  lastWriteAt: string | null;
};

/** Collections whose writes change admin metrics. */
const FRESHNESS_ENTITIES = ["patient", "screening", "review", "referral", "follow_up"] as const;

async function lastWriteAtOf(ctx: TxContext): Promise<string | null> {
  let latest: string | null = null;
  const consider = (rows: ReadonlyArray<{ updatedAt?: string }>) => {
    for (const row of rows) {
      if (row.updatedAt !== undefined && (latest === null || row.updatedAt > latest)) {
        latest = row.updatedAt;
      }
    }
  };
  for (const entity of FRESHNESS_ENTITIES) consider(await ctx.all<{ updatedAt?: string }>(entity));
  consider(await ctx.tx.getAll<{ updatedAt?: string }>("timeEntries"));
  return latest;
}

/** Parses the filter, checks `metrics.read` + aggregate scope, defaults ids to the actor scope. */
function scopedMetricsFilter(ctx: TxContext, f: MetricsFilterInput | undefined): MetricsFilter {
  ctx.authorize("metrics.read", undefined, { entityType: "district", entityId: "metrics" });
  const filter: MetricsFilter = parseFilter(MetricsFilterSchema, f);
  assertRequestedScope(ctx, "metrics.read", filter, { aggregate: true });
  const scope = ctx.requireActor().scope;
  const scoped: MetricsFilter = { ...filter };
  if (!filter.districtIds && !filter.facilityIds) {
    if (scope.kind === "district") scoped.districtIds = [...scope.districtIds] as DistrictId[];
    if (scope.kind === "facility") scoped.facilityIds = [...scope.facilityIds] as FacilityId[];
  }
  return scoped;
}

async function timeEntriesIn(
  ctx: TxContext,
  filter: MetricsFilter,
  facilityIds: ReadonlySet<string>,
): Promise<TimeEntry[]> {
  return (await ctx.tx.getAll<unknown>("timeEntries"))
    .map((row) => TimeEntrySchema.parse(row))
    .filter((e) => facilityIds.has(e.facilityId) && isDayInRange(e.date, filter))
    .sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : a.id < b.id ? -1 : 1));
}

export function createMetricsService(engine: Engine) {
  return {
    /**
     * ADM-02: scoped metric source rows (scope + period, cohort-attributed by FND-06
     * `applyMetricsFilter`) for the admin metric layer. Needs `metrics.read`; ids outside the
     * actor's scope → audited `FORBIDDEN`.
     */
    getMetricsRecords(f?: MetricsFilterInput): Promise<MetricsRecordsResult> {
      return engine.read(async (ctx) => {
        const filter = scopedMetricsFilter(ctx, f);
        const data = applyMetricsFilter(
          {
            patients: await ctx.all<Patient>("patient"),
            screenings: await ctx.all<Screening>("screening"),
            reviews: await ctx.all<Review>("review"),
            referrals: await ctx.all<Referral>("referral"),
            followUps: await ctx.all<FollowUp>("follow_up"),
            facilities: await ctx.all<Facility>("facility"),
            districts: await ctx.all<District>("district"),
          },
          filter,
        );
        const facilityIds = new Set<string>(data.facilities.map((x) => x.id));
        return {
          records: {
            ...data,
            patients: data.patients.map((p) => ({
              ...p,
              displayName: "",
              syntheticIdentifier: "",
              dateOfBirth: null,
            })),
            timeEntries: await timeEntriesIn(ctx, filter, facilityIds),
          },
          asOf: ctx.nowIso,
          lastWriteAt: await lastWriteAtOf(ctx),
        };
      });
    },
    /** ADM-02 (FND-07 extension rule): self-reported demo time entries in the actor's scope. */
    listTimeEntries(f?: MetricsFilterInput): Promise<TimeEntry[]> {
      return engine.read(async (ctx) => {
        const filter = scopedMetricsFilter(ctx, f);
        const facilities = applyMetricsFilter(
          {
            patients: [],
            screenings: [],
            reviews: [],
            referrals: [],
            followUps: [],
            facilities: await ctx.all<Facility>("facility"),
            districts: await ctx.all<District>("district"),
          },
          filter,
        ).facilities;
        return timeEntriesIn(ctx, filter, new Set<string>(facilities.map((x) => x.id)));
      });
    },
    /** Latest write to a metric source (no record data); `metrics.read`. */
    getMetricsFreshness(): Promise<{ lastWriteAt: string | null }> {
      return engine.read(async (ctx) => {
        ctx.authorize("metrics.read", undefined, { entityType: "district", entityId: "metrics" });
        return { lastWriteAt: await lastWriteAtOf(ctx) };
      });
    },
    getAggregateMetrics(f?: MetricsFilterInput): Promise<ProgrammeMetrics> {
      return engine.read(async (ctx) => {
        const scoped = scopedMetricsFilter(ctx, f);
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
