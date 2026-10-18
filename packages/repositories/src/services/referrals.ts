/**
 * Referrals: creation (from a decided review; one open referral per review), FND-02 machine
 * transitions (`completed` needs evidence), derived overdue, counts.
 * CLN-08 adds: `q` search (patient name / synthetic id / destination), `getReferral` (scoped
 * single read) and `editReferral` (destination / due date with a mandatory change reason; the
 * previous values stay in the audit `before`, action `clinical.referral.updated`).
 */
import {
  createReferralTransitionInputSchema,
  ReferralEditInputSchema,
  ReferralFilterSchema,
  ReferralInputSchema,
  type Page,
  type WriteResult,
} from "@laif/contracts";
import {
  asId,
  assertCancellationReason,
  assertCompletionEvidence,
  assertNotCompletedByReminder,
  isReferralOverdue,
  referralMachine,
  REFERRAL_STATUSES,
  type FacilityId,
  type Patient,
  type PersonaId,
  type Referral,
  type ReferralId,
  type Review,
  type ReviewPriority,
} from "@laif/domain";

import type {
  ReferralCall,
  ReferralEditCall,
  ReferralFilterInput,
  ReferralTransitionCall,
} from "../care-repository.ts";
import type { Engine, TxContext } from "../core/engine.ts";
import { RepositoryError } from "../errors.ts";
import {
  assertAuthorisedWorker,
  assertRequestedScope,
  paginate,
  parseFilter,
  READ_PERMISSIONS,
  readPermission,
  referralResource,
  sortBy,
} from "./shared.ts";

const OPEN = (r: Pick<Referral, "status">): boolean =>
  r.status !== "completed" && r.status !== "cancelled_with_reason";

export type NewReferral = {
  review: Review;
  destinationFacilityId: FacilityId;
  dueAt: string;
  priority: ReviewPriority;
  referralReason: string;
  assignedWorkerId: PersonaId | null;
};

/** Shared by `createReferral` and `decideReview(refer)`: one open referral per review. */
export async function insertReferral(ctx: TxContext, spec: NewReferral): Promise<Referral> {
  const existing = (await ctx.all<Referral>("referral")).find(
    (r) => r.reviewId === spec.review.id && OPEN(r),
  );
  if (existing) {
    throw new RepositoryError("CONFLICT", {
      reason: "REFERRAL_ALREADY_OPEN",
      conflict: {
        entityType: "referral",
        entityId: existing.id,
        expectedVersion: existing.version,
        currentVersion: existing.version,
        latest: existing,
      },
    });
  }
  const destination = ctx.facilities.find((f) => f.id === spec.destinationFacilityId);
  if (!destination) {
    throw new RepositoryError("VALIDATION_ERROR", {
      fieldErrors: { destinationFacilityId: { key: "invalid", params: {} } },
    });
  }
  await assertAuthorisedWorker(ctx, spec.review.facilityId, spec.assignedWorkerId);
  const referral: Referral = {
    id: asId<ReferralId>(ctx.ids()),
    patientId: spec.review.patientId,
    reviewId: spec.review.id,
    destination: destination.name,
    requestedAt: ctx.nowIso,
    dueAt: spec.dueAt,
    status: "created",
    completedAt: null,
    completionEvidence: null,
    facilityId: spec.review.facilityId,
    destinationFacilityId: destination.id,
    assignedWorkerId: spec.assignedWorkerId,
    priority: spec.priority,
    referralReason: spec.referralReason,
    appointmentAt: null,
    cancelled: null,
    ...ctx.created(),
  };
  await ctx.save("referral", referral);
  return referral;
}

function referralMatches(
  ctx: TxContext,
  r: Referral,
  filter: ReturnType<typeof ReferralFilterSchema.parse>,
  patients: ReadonlyMap<string, Patient> | null,
): boolean {
  const q = filter.q === undefined || filter.q === "" ? undefined : filter.q.toLowerCase();
  if (q !== undefined) {
    const patient = patients?.get(r.patientId);
    const haystack = [patient?.displayName, patient?.syntheticIdentifier, r.destination, r.id];
    if (!haystack.some((value) => value !== undefined && value.toLowerCase().includes(q))) {
      return false;
    }
  }
  return (
    (!filter.priorities || filter.priorities.includes(r.priority)) &&
    (!filter.patientId || r.patientId === filter.patientId) &&
    (!filter.facilityIds || (filter.facilityIds as string[]).includes(r.facilityId)) &&
    (!filter.destinationFacilityIds ||
      (filter.destinationFacilityIds as string[]).includes(r.destinationFacilityId)) &&
    (!filter.assignedWorkerId || r.assignedWorkerId === filter.assignedWorkerId) &&
    (!filter.overdueOnly || isReferralOverdue(r, ctx.now))
  );
}

async function scopedReferrals(ctx: TxContext, f: ReferralFilterInput | undefined) {
  const filter = parseFilter(ReferralFilterSchema, f);
  const permission = readPermission(ctx, READ_PERMISSIONS.referral, {
    entityType: "referral",
    entityId: "list",
  });
  assertRequestedScope(ctx, permission, filter);
  const patients =
    filter.q === undefined || filter.q === ""
      ? null
      : new Map((await ctx.all<Patient>("patient")).map((p) => [p.id as string, p]));
  const rows = (await ctx.all<Referral>("referral")).filter(
    (r) =>
      (ctx.can(permission, referralResource(r)) ||
        ctx.can(permission, { ...referralResource(r), facilityId: r.destinationFacilityId })) &&
      referralMatches(ctx, r, filter, patients),
  );
  return { filter, rows };
}

export function createReferralService(engine: Engine) {
  return {
    listReferrals(f?: ReferralFilterInput): Promise<Page<Referral>> {
      return engine.read(async (ctx) => {
        const { filter, rows } = await scopedReferrals(ctx, f);
        const visible = rows.filter((r) => !filter.statuses || filter.statuses.includes(r.status));
        return paginate(
          sortBy(visible, (r) => r.dueAt),
          filter.page,
          filter.pageSize,
        );
      });
    },

    /**
     * CLN-08: one referral, scope-checked like the list (referring OR destination facility).
     * Out of scope → audited `access.denied` + `FORBIDDEN`; unknown → null. The view itself is
     * audited by the UI (`referral.viewed`).
     */
    getReferral(id: string): Promise<Referral | null> {
      return engine.read(async (ctx) => {
        const target = { entityType: "referral", entityId: id } as const;
        const permission = readPermission(ctx, READ_PERMISSIONS.referral, target);
        const referral = await ctx.find<Referral>("referral", id);
        if (!referral) return null;
        const resource = referralResource(referral);
        if (
          !ctx.can(permission, resource) &&
          !ctx.can(permission, { ...resource, facilityId: referral.destinationFacilityId })
        ) {
          ctx.authorize(permission, resource, target);
        }
        return referral;
      });
    },

    /** Counts by status plus derived `overdue` and `all` (same predicates as the list). */
    countReferrals(f?: ReferralFilterInput): Promise<Record<string, number>> {
      return engine.read(async (ctx) => {
        const { rows } = await scopedReferrals(ctx, { ...f, statuses: undefined });
        const counts: Record<string, number> = Object.fromEntries(
          REFERRAL_STATUSES.map((s) => [s, 0]),
        );
        for (const r of rows) counts[r.status] = (counts[r.status] ?? 0) + 1;
        counts["open"] = rows.filter(OPEN).length;
        counts["overdue"] = rows.filter((r) => isReferralOverdue(r, ctx.now)).length;
        counts["all"] = rows.length;
        return counts;
      });
    },

    createReferral(i: ReferralCall, key: string): Promise<WriteResult<Referral>> {
      return engine.mutate({
        op: "createReferral",
        key,
        input: i,
        entityType: "referral",
        permission: "referral.manage",
        schema: ReferralInputSchema,
        run: async (ctx, input) => {
          const review = await ctx.load<Review>("review", input.reviewId);
          ctx.authorize(
            "referral.manage",
            { facilityId: review.facilityId, patientId: review.patientId },
            { entityType: "review", entityId: review.id },
          );
          if (review.patientId !== input.patientId) {
            throw new RepositoryError("VALIDATION_ERROR", {
              fieldErrors: { patientId: { key: "invalid", params: {} } },
            });
          }
          if (review.status !== "action_recorded") {
            throw new RepositoryError("VALIDATION_ERROR", {
              reason: "INVALID_TRANSITION",
              details: { reviewStatus: review.status },
            });
          }
          const referral = await insertReferral(ctx, {
            review,
            destinationFacilityId: input.destinationFacilityId,
            dueAt: input.dueAt,
            priority: input.priority,
            referralReason: input.referralReason,
            assignedWorkerId: input.assignedWorkerId ?? null,
          });
          ctx.useCorrelation(await ctx.correlationOf(review.id));
          const event = await ctx.audit({
            action: "referral.created",
            entityType: "referral",
            entityId: referral.id,
            after: referral,
            changeSummary: { reviewId: review.id, priority: referral.priority },
          });
          return {
            data: referral,
            entityType: "referral",
            auditEventId: event.id,
            sync: { entityType: "referral", entityId: referral.id, opType: "create" },
          };
        },
      });
    },

    transitionReferral(i: ReferralTransitionCall, key: string): Promise<WriteResult<Referral>> {
      return engine.mutate({
        op: "transitionReferral",
        key,
        input: i,
        entityType: "referral",
        permission: null,
        schema: (ctx) =>
          Promise.resolve(createReferralTransitionInputSchema({ now: () => ctx.now })),
        run: async (ctx, input) => {
          const actor = ctx.requireActor();
          const referral = await ctx.load<Referral>("referral", input.referralId);
          const resource = referralResource(referral);
          const permission = input.to === "completed" ? "referral.complete" : "referral.manage";
          ctx.authorize(permission, resource, { entityType: "referral", entityId: referral.id });
          await ctx.assertVersion("referral", referral, input.expectedVersion, resource);
          assertNotCompletedByReminder({
            trigger: "user_action",
            entityType: "referral",
            to: input.to,
          });
          if (!referralMachine.can(referral.status, input.to)) {
            throw new RepositoryError("VALIDATION_ERROR", {
              reason: "INVALID_TRANSITION",
              details: { machine: "referral", from: referral.status, to: input.to },
            });
          }
          let next: Referral;
          switch (input.to) {
            case "accepted":
              next = ctx.touch(referral, { status: "accepted" });
              break;
            case "scheduled":
              next = ctx.touch(referral, {
                status: "scheduled",
                appointmentAt: input.appointmentAt,
              });
              break;
            case "completed":
              next = ctx.touch(referral, {
                status: "completed",
                completedAt: input.completedAt,
                completionEvidence: {
                  type: input.evidenceType,
                  reference: input.evidenceReference,
                  outcome: input.outcome,
                  note: input.note ?? "",
                  recordedBy: actor.personaId,
                  recordedAt: ctx.nowIso,
                },
              });
              assertCompletionEvidence(next);
              break;
            case "cancelled_with_reason":
              assertCancellationReason(input.reason);
              next = ctx.touch(referral, {
                status: "cancelled_with_reason",
                cancelled: { reasonCode: input.cancelReasonCode, reason: input.reason },
              });
              break;
          }
          await ctx.save("referral", next);
          ctx.useCorrelation(await ctx.correlationOf(referral.id));
          const event = await ctx.audit({
            action: "referral.transitioned",
            entityType: "referral",
            entityId: referral.id,
            before: referral,
            after: next,
            changeSummary: {
              from: referral.status,
              to: next.status,
              ...(input.to === "completed"
                ? { evidenceType: input.evidenceType, evidenceReference: input.evidenceReference }
                : {}),
              ...(input.to === "cancelled_with_reason"
                ? { cancelReasonCode: input.cancelReasonCode }
                : {}),
              ...(input.to === "scheduled" ? { appointmentAt: input.appointmentAt } : {}),
            },
            justification: input.to === "cancelled_with_reason" ? input.reason : null,
          });
          return {
            data: next,
            entityType: "referral",
            auditEventId: event.id,
            sync: { entityType: "referral", entityId: referral.id, opType: "update" },
          };
        },
      });
    },

    /**
     * CLN-08: change destination and/or due date of an OPEN referral (`referral.manage`). The
     * reason is mandatory; the previous values remain in the audit `before` and `changeSummary`.
     * Terminal referrals → `INVALID_TRANSITION`; stale `expectedVersion` → `CONFLICT`.
     */
    editReferral(i: ReferralEditCall, key: string): Promise<WriteResult<Referral>> {
      return engine.mutate({
        op: "editReferral",
        key,
        input: i,
        entityType: "referral",
        permission: "referral.manage",
        schema: ReferralEditInputSchema,
        run: async (ctx, input) => {
          const referral = await ctx.load<Referral>("referral", input.referralId);
          const resource = referralResource(referral);
          ctx.authorize("referral.manage", resource, {
            entityType: "referral",
            entityId: referral.id,
          });
          await ctx.assertVersion("referral", referral, input.expectedVersion, resource);
          if (!OPEN(referral)) {
            throw new RepositoryError("VALIDATION_ERROR", {
              reason: "INVALID_TRANSITION",
              details: { machine: "referral", from: referral.status, to: "edit" },
            });
          }
          const patch: Partial<Referral> = {};
          const changes: Record<string, { from: string; to: string }> = {};
          if (
            input.destinationFacilityId !== undefined &&
            input.destinationFacilityId !== referral.destinationFacilityId
          ) {
            const destination = ctx.facilities.find((f) => f.id === input.destinationFacilityId);
            if (!destination) {
              throw new RepositoryError("VALIDATION_ERROR", {
                fieldErrors: { destinationFacilityId: { key: "invalid", params: {} } },
              });
            }
            patch.destinationFacilityId = destination.id;
            patch.destination = destination.name;
            changes["destinationFacilityId"] = {
              from: referral.destinationFacilityId,
              to: destination.id,
            };
          }
          if (input.dueAt !== undefined && input.dueAt !== referral.dueAt) {
            if (Date.parse(input.dueAt) <= ctx.now.getTime()) {
              throw new RepositoryError("VALIDATION_ERROR", {
                fieldErrors: { dueAt: { key: "dateMustBeFuture", params: {} } },
              });
            }
            patch.dueAt = input.dueAt;
            changes["dueAt"] = { from: referral.dueAt, to: input.dueAt };
          }
          if (Object.keys(changes).length === 0) {
            throw new RepositoryError("VALIDATION_ERROR", {
              fieldErrors: { changeReason: { key: "noChanges", params: {} } },
            });
          }
          const next = ctx.touch(referral, patch);
          await ctx.save("referral", next);
          ctx.useCorrelation(await ctx.correlationOf(referral.id));
          const event = await ctx.audit({
            action: "clinical.referral.updated",
            entityType: "referral",
            entityId: referral.id,
            before: referral,
            after: next,
            changeSummary: { fields: Object.keys(changes), ...changes },
            justification: input.changeReason,
          });
          return {
            data: next,
            entityType: "referral",
            auditEventId: event.id,
            sync: { entityType: "referral", entityId: referral.id, opType: "update" },
          };
        },
      });
    },
  };
}
