/**
 * Reviews: queue (CLN-05 predicates shared with counts), audited detail read, start / take
 * over, and the single decision contract (CLN-07). Dismissal creates nothing (WF-03.3); `refer`
 * creates a Referral; `request_repeat_screening` / `plan_follow_up` a FollowUp — all in the
 * same transaction with one correlation id.
 */
import {
  createReviewDecisionInputSchema,
  ReviewFilterSchema,
  StartReviewInputSchema,
  type Page,
  type WriteResult,
} from "@laif/contracts";
import {
  DEFAULT_REVIEW_QUEUE_SORT,
  assertAttributable,
  assertDismissalReason,
  isReviewOpen,
  matchesReviewQueueTab,
  REVIEW_QUEUE_TABS,
  reviewMachine,
  type FollowUp,
  type Patient,
  type Referral,
  type Review,
  type ReviewDecision,
  type ReviewQueueSort,
  type Screening,
} from "@laif/domain";

import type {
  ReviewCounts,
  ReviewDecisionCall,
  ReviewDetail,
  ReviewFilterInput,
  StartReviewCall,
} from "../care-repository.ts";
import type { Engine, TxContext } from "../core/engine.ts";
import { RepositoryError } from "../errors.ts";
import { insertFollowUp } from "./follow-ups.ts";
import { insertReferral } from "./referrals.ts";
import {
  assertRequestedScope,
  paginate,
  parseFilter,
  READ_PERMISSIONS,
  readPermission,
  reviewResource,
  sortBy,
} from "./shared.ts";

async function scopedReviews(ctx: TxContext, f: ReviewFilterInput | undefined) {
  const filter = parseFilter(ReviewFilterSchema, f);
  const permission = readPermission(ctx, READ_PERMISSIONS.review, {
    entityType: "review",
    entityId: "list",
  });
  assertRequestedScope(ctx, permission, filter);
  const context = { now: ctx.now, personaId: ctx.actorId };
  const q = filter.q === undefined || filter.q === "" ? undefined : filter.q.toLowerCase();
  // Patient names: needed for the CLN-05 queue search and the patient sort only.
  const patients =
    q !== undefined || filter.sort === "patient_asc"
      ? new Map((await ctx.all<Patient>("patient")).map((p) => [p.id as string, p]))
      : null;
  const decidedSince = filter.decidedSince === undefined ? null : Date.parse(filter.decidedSince);
  const rows = (await ctx.all<Review>("review")).filter((r) => {
    if (!ctx.can(permission, reviewResource(r))) return false;
    if (filter.priorities && !filter.priorities.includes(r.priority)) return false;
    if (filter.origins && !filter.origins.includes(r.origin)) return false;
    if (
      filter.assignedClinicianId !== undefined &&
      r.assignedClinicianId !== filter.assignedClinicianId
    ) {
      return false;
    }
    if (filter.patientId && r.patientId !== filter.patientId) return false;
    if (filter.facilityIds && !(filter.facilityIds as string[]).includes(r.facilityId)) {
      return false;
    }
    if (filter.overdueOnly && !matchesReviewQueueTab(r, "overdue", context)) return false;
    if (
      decidedSince !== null &&
      (r.reviewedAt === null || Date.parse(r.reviewedAt) < decidedSince)
    ) {
      return false;
    }
    if (q !== undefined) {
      const patient = patients?.get(r.patientId);
      if (
        patient === undefined ||
        !(
          patient.displayName.toLowerCase().includes(q) ||
          patient.syntheticIdentifier.toLowerCase().includes(q)
        )
      ) {
        return false;
      }
    }
    return true;
  });
  return { filter, rows, context, patients };
}

/** CLN-05 queue order; ties broken by id (deterministic). Reviews without a due date sort last. */
function sortReviews(
  rows: Review[],
  sort: ReviewQueueSort | undefined,
  patients: ReadonlyMap<string, Patient> | null,
): Review[] {
  switch (sort ?? DEFAULT_REVIEW_QUEUE_SORT) {
    case "flaggedAt_asc":
      return sortBy(rows, (r) => r.createdAt);
    case "flaggedAt_desc":
      return sortBy(rows, (r) => r.createdAt, "desc");
    case "dueAt_asc":
      // "\uffff" sorts after every ISO instant.
      return sortBy(rows, (r) => r.reviewDueAt ?? "\uffff");
    case "patient_asc":
      return sortBy(rows, (r) => (patients?.get(r.patientId)?.displayName ?? "").toLowerCase());
  }
}

function alreadyDecided(review: Review): RepositoryError {
  return new RepositoryError("CONFLICT", {
    reason: "ALREADY_DECIDED",
    conflict: {
      entityType: "review",
      entityId: review.id,
      expectedVersion: review.version,
      currentVersion: review.version,
      latest: review,
      ...(review.reviewedBy ? { changedBy: review.reviewedBy } : {}),
      ...(review.reviewedAt ? { changedAt: review.reviewedAt } : {}),
    },
  });
}

export function createReviewService(engine: Engine) {
  return {
    /**
     * Queue order (`sort`, default oldest flag first); `statuses` and the CLN-05 `tab` predicate
     * are applied on top of the shared filter, so `items.length` over all pages of a tab equals
     * `countReviews(sameFilter)[tab]`.
     */
    listReviews(f?: ReviewFilterInput): Promise<Page<Review>> {
      return engine.read(async (ctx) => {
        const { filter, rows, context, patients } = await scopedReviews(ctx, f);
        const tab = filter.tab;
        const visible = rows.filter(
          (r) =>
            (!filter.statuses || filter.statuses.includes(r.status)) &&
            (tab === undefined || matchesReviewQueueTab(r, tab, context)),
        );
        return paginate(sortReviews(visible, filter.sort, patients), filter.page, filter.pageSize);
      });
    },

    /**
     * `{ pending, urgent, overdue, assigned, all }` over the same filter (facility, assignee, `q`
     * …) minus `statuses`, `tab`, `sort` and paging.
     */
    countReviews(f?: ReviewFilterInput): Promise<ReviewCounts> {
      return engine.read(async (ctx) => {
        const { rows, context } = await scopedReviews(ctx, f);
        const counts = Object.fromEntries(REVIEW_QUEUE_TABS.map((t) => [t, 0])) as ReviewCounts;
        for (const r of rows) {
          for (const tab of REVIEW_QUEUE_TABS) {
            if (matchesReviewQueueTab(r, tab, context)) counts[tab] += 1;
          }
        }
        return counts;
      });
    },

    /** Review + screening + patient + linked referrals / follow-ups; audited (`review.viewed`). */
    getReview(id: string): Promise<ReviewDetail | null> {
      return engine.read(async (ctx) => {
        const permission = readPermission(ctx, READ_PERMISSIONS.review, {
          entityType: "review",
          entityId: id,
        });
        const review = await ctx.find<Review>("review", id);
        if (!review) return null;
        ctx.authorize(permission, reviewResource(review), { entityType: "review", entityId: id });
        await ctx.auditAccess({
          action: "review.viewed",
          entityType: "review",
          entityId: id,
          after: review,
        });
        const screening = (await ctx.find<Screening>("screening", review.screeningId)) ?? null;
        const patient = (await ctx.find<Patient>("patient", review.patientId)) ?? null;
        const referrals = (await ctx.all<Referral>("referral")).filter((r) => r.reviewId === id);
        const followUps = (await ctx.all<FollowUp>("follow_up")).filter(
          (fu) =>
            fu.reviewId === id ||
            (fu.referralId !== null && referrals.some((r) => r.id === fu.referralId)),
        );
        return { review, screening, patient, referrals, followUps };
      });
    },

    startReview(i: StartReviewCall, key: string): Promise<WriteResult<Review>> {
      return engine.mutate({
        op: "startReview",
        key,
        input: i,
        entityType: "review",
        permission: "review.decide",
        schema: StartReviewInputSchema,
        run: async (ctx, input) => {
          const actor = ctx.requireActor();
          const review = await ctx.load<Review>("review", input.reviewId);
          const resource = reviewResource(review);
          ctx.authorize("review.decide", resource, { entityType: "review", entityId: review.id });
          await ctx.assertVersion("review", review, input.expectedVersion, resource);
          if (!isReviewOpen(review)) throw alreadyDecided(review);
          ctx.useCorrelation(await ctx.correlationOf(review.id));

          if (review.status === "in_review" && review.startedBy === actor.personaId) {
            // Already mine: no change, but the open is still attributable.
            const event = await ctx.audit({
              action: "review.started",
              entityType: "review",
              entityId: review.id,
              after: review,
              changeSummary: { alreadyStarted: true },
            });
            return { data: review, entityType: "review", auditEventId: event.id, sync: null };
          }
          const takeOver = review.status === "in_review";
          if (takeOver && !input.takeOverReason) {
            throw new RepositoryError("VALIDATION_ERROR", {
              fieldErrors: { takeOverReason: { key: "required", params: {} } },
              details: { startedBy: review.startedBy },
            });
          }
          if (!takeOver) reviewMachine.assert(review.status, "in_review");
          const next = ctx.touch(review, {
            status: "in_review",
            startedBy: actor.personaId,
            assignedClinicianId: takeOver
              ? actor.personaId
              : (review.assignedClinicianId ?? actor.personaId),
          });
          await ctx.save("review", next);
          const event = await ctx.audit({
            action: takeOver ? "review.taken_over" : "review.started",
            entityType: "review",
            entityId: review.id,
            before: review,
            after: next,
            changeSummary: takeOver ? { from: review.startedBy } : {},
            justification: takeOver ? (input.takeOverReason ?? null) : null,
          });
          return { data: next, entityType: "review", auditEventId: event.id, sync: null };
        },
      });
    },

    decideReview(i: ReviewDecisionCall, key: string): Promise<WriteResult<Review>> {
      return engine.mutate({
        op: "decideReview",
        key,
        input: i,
        entityType: "review",
        permission: "review.decide",
        // Demo-clock factory: `dueAt` must be after demo now.
        schema: (ctx) => Promise.resolve(createReviewDecisionInputSchema({ now: () => ctx.now })),
        run: async (ctx, input) => {
          const actor = ctx.requireActor();
          const review = await ctx.load<Review>("review", input.reviewId);
          const resource = reviewResource(review);
          ctx.authorize("review.decide", resource, { entityType: "review", entityId: review.id });
          await ctx.assertVersion("review", review, input.expectedVersion, resource);
          if (!isReviewOpen(review)) throw alreadyDecided(review);
          const correlation = ctx.useCorrelation(await ctx.correlationOf(review.id));

          const dismiss = input.kind === "dismiss";
          const note = dismiss
            ? input.reason
            : input.kind === "refer"
              ? input.referralReason
              : (input.note ?? "");
          const decision: ReviewDecision = {
            kind: input.kind,
            note,
            decidedBy: actor.personaId,
            decidedAt: ctx.nowIso,
          };
          if (dismiss) {
            assertDismissalReason(input.reason);
            decision.reasonCode = input.dismissReasonCode;
          }
          assertAttributable(decision);
          const to = dismiss ? "dismissed_with_reason" : "action_recorded";
          reviewMachine.assert(review.status, to);
          const next = ctx.touch(review, {
            status: to,
            decision,
            decisionReason: note,
            reviewedAt: ctx.nowIso,
            reviewedBy: actor.personaId,
            assignedClinicianId: review.assignedClinicianId ?? actor.personaId,
          });
          await ctx.save("review", next);
          const event = await ctx.audit({
            action: dismiss ? "review.dismissed" : "review.decided",
            entityType: "review",
            entityId: review.id,
            before: review,
            after: next,
            correlationId: correlation,
            changeSummary: dismiss
              ? { kind: "dismiss", reasonCode: input.dismissReasonCode, from: review.status }
              : { kind: input.kind, from: review.status, to },
            justification: note,
          });

          switch (input.kind) {
            case "refer": {
              const referral = await insertReferral(ctx, {
                review: next,
                destinationFacilityId: input.destinationFacilityId,
                dueAt: input.dueAt,
                priority: input.priority,
                referralReason: input.referralReason,
                assignedWorkerId: null,
              });
              await ctx.audit({
                action: "referral.created",
                entityType: "referral",
                entityId: referral.id,
                after: referral,
                correlationId: correlation,
                changeSummary: { reviewId: review.id, priority: referral.priority },
              });
              break;
            }
            case "request_repeat_screening":
            case "plan_follow_up": {
              const followUp = await insertFollowUp(ctx, {
                patientId: review.patientId,
                facilityId: review.facilityId,
                purpose:
                  input.kind === "request_repeat_screening" ? "repeat_screening" : "planned_review",
                dueAt: input.dueAt,
                assignedWorkerId: input.assignedWorkerId ?? null,
                referralId: null,
                reviewId: review.id,
                note:
                  input.kind === "request_repeat_screening"
                    ? input.instructionsForWorker
                    : input.note,
              });
              await ctx.audit({
                action: "followup.created",
                entityType: "follow_up",
                entityId: followUp.id,
                after: followUp,
                correlationId: correlation,
                changeSummary: { purpose: followUp.purpose, reviewId: review.id },
              });
              break;
            }
            case "no_further_action":
            case "dismiss":
              // WF-03.3: nothing else is created.
              break;
          }
          return {
            data: next,
            entityType: "review",
            auditEventId: event.id,
            sync: { entityType: "review", entityId: review.id, opType: "command" },
          };
        },
      });
    },
  };
}
