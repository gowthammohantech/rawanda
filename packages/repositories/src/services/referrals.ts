/**
 * Referrals: creation (from a decided review; one open referral per review), FND-02 machine
 * transitions (`completed` needs evidence), derived overdue, counts.
 */
import {
  createReferralTransitionInputSchema,
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
  type PersonaId,
  type Referral,
  type ReferralId,
  type Review,
  type ReviewPriority,
} from "@laif/domain";

import type {
  ReferralCall,
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
): boolean {
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
  const rows = (await ctx.all<Referral>("referral")).filter(
    (r) =>
      (ctx.can(permission, referralResource(r)) ||
        ctx.can(permission, { ...referralResource(r), facilityId: r.destinationFacilityId })) &&
      referralMatches(ctx, r, filter),
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
            changeSummary: { from: referral.status, to: next.status },
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
  };
}
