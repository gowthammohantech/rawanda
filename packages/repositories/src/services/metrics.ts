/**
 * Aggregate programme metrics (PA, ADM-02…07) over the FND-06 calculators. Scope is enforced
 * here: requesting a district / facility outside the actor's scope → `FORBIDDEN` with an audited
 * denial (WF-04, T-02); without explicit ids the result is restricted to the actor's scope.
 */
import {
  ageBandOf,
  applyMetricsFilter,
  duplicateIdentifierGroupsOf,
  isDayInRange,
  kigaliDate,
  getProgrammeMetrics,
  type MetricsRecords,
  type ProgrammeMetrics,
  type WorkerRef,
} from "@laif/analytics";
import {
  DataQualityIssueSchema,
  MetricsFilterSchema,
  TimeEntrySchema,
  type DataQualityIssueStatus,
  type MetricsFilter,
  type TimeEntry,
} from "@laif/contracts";
import type {
  AuditEvent,
  DemoPersona,
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

/**
 * ADM-05 workload source: in-scope follow-ups created in the period OR with a contact attempt in
 * it, whatever screening they came from (the workload attribution exception).
 */
function taskFollowUpsIn(
  followUps: readonly FollowUp[],
  filter: MetricsFilter,
  facilityIds: ReadonlySet<string>,
): FollowUp[] {
  return followUps.filter(
    (f) =>
      facilityIds.has(f.facilityId) &&
      (isDayInRange(kigaliDate(f.createdAt), filter) ||
        f.attempts.some((a) => isDayInRange(kigaliDate(a.at), filter))),
  );
}

/**
 * ADM-05 staff directory of the in-scope facilities: pseudonymous `workerCode` + facilities only
 * (no names). Every staff persona with a code, so any assignee / recorder resolves to a code.
 */
function workerDirectory(
  personas: readonly DemoPersona[],
  facilityIds: ReadonlySet<string>,
): WorkerRef[] {
  const out: WorkerRef[] = [];
  for (const p of personas) {
    if (p.workerCode === null) continue;
    const inScope = p.facilityIds.filter((id) => facilityIds.has(id));
    if (inScope.length > 0) out.push({ id: p.id, workerCode: p.workerCode, facilityIds: inScope });
  }
  return out.sort((a, b) =>
    a.workerCode < b.workerCode ? -1 : a.workerCode > b.workerCode ? 1 : 0,
  );
}

/**
 * ADM-06 quality sources of an aggregate read, computed HERE so identifiers and dates of birth
 * never leave the repository: duplicate-identifier groups (patient ids only), age bands,
 * `sync.duplicate_suppressed` events (facility + time) and the stored triage status per issue.
 */
async function qualitySourcesOf(
  ctx: TxContext,
  patients: readonly Patient[],
  filter: MetricsFilter,
  facilityIds: ReadonlySet<string>,
): Promise<{
  duplicateIdentifierGroups: string[][];
  patientAgeBands: Record<string, ReturnType<typeof ageBandOf>>;
  duplicateSubmissions: Array<{ facilityId: string; occurredAt: string }>;
  qualityIssueStatus: Record<string, DataQualityIssueStatus>;
}> {
  const duplicateSubmissions = (await ctx.tx.getAll<AuditEvent>("auditEvents"))
    .filter(
      (e) =>
        e.action === "sync.duplicate_suppressed" &&
        e.facilityId !== null &&
        facilityIds.has(e.facilityId) &&
        isDayInRange(kigaliDate(e.occurredAt), filter),
    )
    .map((e) => ({ facilityId: e.facilityId as string, occurredAt: e.occurredAt }))
    .sort((a, b) => (a.occurredAt < b.occurredAt ? -1 : a.occurredAt > b.occurredAt ? 1 : 0));
  const qualityIssueStatus: Record<string, DataQualityIssueStatus> = {};
  for (const row of await ctx.all<unknown>("data_quality_issue")) {
    const issue = DataQualityIssueSchema.parse(row);
    if (facilityIds.has(issue.facilityId)) qualityIssueStatus[issue.id] = issue.status;
  }
  return {
    duplicateIdentifierGroups: duplicateIdentifierGroupsOf(patients),
    patientAgeBands: Object.fromEntries(patients.map((p) => [p.id, ageBandOf(p, ctx.nowIso)])),
    duplicateSubmissions,
    qualityIssueStatus,
  };
}

/** Placeholder for required non-empty free text removed from aggregate reads. */
export const REDACTED_TEXT = "[redacted]";

/**
 * Free text (notes, reasons, evidence references) can carry patient detail and is never read by
 * the metric calculators, so aggregate reads blank it: admin roles hold `metrics.read`, not the
 * clinical read permissions that would expose it.
 */
function redactFreeText<
  T extends {
    screenings: Screening[];
    reviews: Review[];
    referrals: Referral[];
    followUps: FollowUp[];
  },
>(data: T): T {
  return {
    ...data,
    screenings: data.screenings.map((s) => ({
      ...s,
      notes: "",
      amendments: s.amendments.map((a) => ({ ...a, reason: REDACTED_TEXT })),
    })),
    reviews: data.reviews.map((r) => ({
      ...r,
      decisionReason: r.decisionReason === null ? null : REDACTED_TEXT,
      decision: r.decision === null ? null : { ...r.decision, note: "" },
    })),
    referrals: data.referrals.map((r) => {
      const rest: Referral = { ...r };
      delete rest.referralReason;
      return {
        ...rest,
        completionEvidence:
          r.completionEvidence === null
            ? null
            : { ...r.completionEvidence, reference: REDACTED_TEXT, note: "" },
        cancelled: r.cancelled === null ? null : { ...r.cancelled, reason: REDACTED_TEXT },
      };
    }),
    followUps: data.followUps.map((f) => ({
      ...f,
      attempts: f.attempts.map((a) => ({ ...a, note: "" })),
      outcome: f.outcome === null ? null : { ...f.outcome, note: "" },
      notes: f.notes.map((n) => ({ ...n, text: REDACTED_TEXT })),
      assignmentHistory: f.assignmentHistory.map((h) => ({
        ...h,
        reason: h.reason === null ? null : REDACTED_TEXT,
      })),
      clinicianConfirmation: (() => {
        const rest = { ...f.clinicianConfirmation };
        delete rest.reason;
        return rest;
      })(),
    })),
  };
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
        const allFollowUps = await ctx.all<FollowUp>("follow_up");
        const data = applyMetricsFilter(
          {
            patients: await ctx.all<Patient>("patient"),
            screenings: await ctx.all<Screening>("screening"),
            reviews: await ctx.all<Review>("review"),
            referrals: await ctx.all<Referral>("referral"),
            followUps: allFollowUps,
            facilities: await ctx.all<Facility>("facility"),
            districts: await ctx.all<District>("district"),
          },
          filter,
        );
        const facilityIds = new Set<string>(data.facilities.map((x) => x.id));
        const tasks = redactFreeText({
          screenings: [],
          reviews: [],
          referrals: [],
          followUps: taskFollowUpsIn(allFollowUps, filter, facilityIds),
        }).followUps;
        const quality = await qualitySourcesOf(ctx, data.patients, filter, facilityIds);
        return {
          records: {
            ...redactFreeText(data),
            ...quality,
            taskFollowUps: tasks,
            workers: workerDirectory(await ctx.tx.getAll<DemoPersona>("personas"), facilityIds),
            patients: data.patients.map((p) => {
              // HWM-04 optional contact/location detail never leaves an aggregate read.
              const rest: Patient = { ...p };
              delete rest.villageLabel;
              delete rest.syntheticPhone;
              return { ...rest, displayName: "", syntheticIdentifier: "", dateOfBirth: null };
            }),
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
