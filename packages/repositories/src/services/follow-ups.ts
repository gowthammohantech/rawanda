/**
 * Follow-ups: creation, the FND-03 action union (assign … return_to_worker) on the FND-02
 * machine, worker completion → clinician confirmation (WF-01 step 7), derived overdue, counts.
 * Note: `followUpMachine.terminal` is `[]` (completed → contacted return edge) — "closed" means
 * `status === 'completed'`, never "terminal".
 * CLN-09 adds `getFollowUp` (scoped single read for the task drawer; out of scope → FORBIDDEN +
 * `access.denied`).
 */
import {
  FollowUpFilterSchema,
  FollowUpInputSchema,
  FollowUpUpdateInputSchema,
  type Page,
  type WriteResult,
} from "@laif/contracts";
import {
  asId,
  assertCompletionEvidence,
  assertFollowUpTransition,
  assertNotCompletedByReminder,
  FOLLOW_UP_STATUSES,
  isFollowUpOverdue,
  type ContactAttemptId,
  type FacilityId,
  type FollowUp,
  type FollowUpId,
  type FollowUpPurpose,
  type FollowUpStatus,
  type Patient,
  type PatientId,
  type PersonaId,
  type Referral,
  type ReferralId,
  type Review,
  type ReviewId,
} from "@laif/domain";

import type { FollowUpCall, FollowUpFilterInput, FollowUpUpdateCall } from "../care-repository.ts";
import type { Engine, TxContext } from "../core/engine.ts";
import type { AuditAction } from "../audit/actions.ts";
import { RepositoryError } from "../errors.ts";
import {
  assertAuthorisedWorker,
  assertRequestedScope,
  followUpResource,
  paginate,
  parseFilter,
  READ_PERMISSIONS,
  readPermission,
  sortBy,
} from "./shared.ts";

export type NewFollowUp = {
  patientId: PatientId;
  facilityId: FacilityId;
  purpose: FollowUpPurpose;
  dueAt: string;
  assignedWorkerId: PersonaId | null;
  referralId: ReferralId | null;
  reviewId: ReviewId | null;
  note: string | null;
};

/** Shared by `createFollowUp` and `decideReview(request_repeat_screening | plan_follow_up)`. */
export async function insertFollowUp(ctx: TxContext, spec: NewFollowUp): Promise<FollowUp> {
  const actor = ctx.requireActor();
  await assertAuthorisedWorker(ctx, spec.facilityId, spec.assignedWorkerId);
  const followUp: FollowUp = {
    id: asId<FollowUpId>(ctx.ids()),
    patientId: spec.patientId,
    referralId: spec.referralId,
    reviewId: spec.reviewId,
    facilityId: spec.facilityId,
    assignedWorkerId: spec.assignedWorkerId,
    dueAt: spec.dueAt,
    status: "assigned",
    attempts: [],
    completedAt: null,
    outcome: null,
    purpose: spec.purpose,
    assignmentHistory: spec.assignedWorkerId
      ? [
          {
            workerId: spec.assignedWorkerId,
            assignedAt: ctx.nowIso,
            assignedBy: actor.personaId,
            reason: null,
          },
        ]
      : [],
    notes: spec.note ? [{ at: ctx.nowIso, by: actor.personaId, text: spec.note }] : [],
    clinicianConfirmation: { status: "not_required" },
    ...ctx.created(),
  };
  await ctx.save("follow_up", followUp);
  return followUp;
}

const CLINICAL_ROLES = new Set(["clinician", "nurse_reviewer", "facility_coordinator"]);
/** Actions only the care team may send (CHWs record attempts / outcomes / notes). */
const CARE_TEAM_ACTIONS = new Set([
  "assign",
  "reassign",
  "set_due_date",
  "confirm_completion",
  "return_to_worker",
]);

async function scopedFollowUps(ctx: TxContext, f: FollowUpFilterInput | undefined) {
  const filter = parseFilter(FollowUpFilterSchema, f);
  const permission = readPermission(ctx, READ_PERMISSIONS.followUp, {
    entityType: "follow_up",
    entityId: "list",
  });
  assertRequestedScope(ctx, permission, filter);
  const rows = (await ctx.all<FollowUp>("follow_up")).filter(
    (fu) =>
      ctx.can(permission, followUpResource(fu)) &&
      (!filter.purposes || filter.purposes.includes(fu.purpose)) &&
      (!filter.patientId || fu.patientId === filter.patientId) &&
      (!filter.facilityIds || (filter.facilityIds as string[]).includes(fu.facilityId)) &&
      (filter.assignedWorkerId === undefined || fu.assignedWorkerId === filter.assignedWorkerId) &&
      (!filter.overdueOnly || isFollowUpOverdue(fu, ctx.now)),
  );
  return { filter, rows };
}

export function createFollowUpService(engine: Engine) {
  return {
    getFollowUp(id: string): Promise<FollowUp | null> {
      return engine.read(async (ctx) => {
        const target = { entityType: "follow_up", entityId: id } as const;
        const permission = readPermission(ctx, READ_PERMISSIONS.followUp, target);
        const followUp = await ctx.find<FollowUp>("follow_up", id);
        if (!followUp) return null;
        ctx.authorize(permission, followUpResource(followUp), target);
        return followUp;
      });
    },

    listFollowUps(f?: FollowUpFilterInput): Promise<Page<FollowUp>> {
      return engine.read(async (ctx) => {
        const { filter, rows } = await scopedFollowUps(ctx, f);
        const visible = rows.filter((r) => !filter.statuses || filter.statuses.includes(r.status));
        return paginate(
          sortBy(visible, (r) => r.dueAt),
          filter.page,
          filter.pageSize,
        );
      });
    },

    /** Counts by status + `open`, derived `overdue`, `pendingConfirmation` and `all`. */
    countFollowUps(f?: FollowUpFilterInput): Promise<Record<string, number>> {
      return engine.read(async (ctx) => {
        const { rows } = await scopedFollowUps(ctx, f);
        const counts: Record<string, number> = Object.fromEntries(
          FOLLOW_UP_STATUSES.map((s) => [s, 0]),
        );
        for (const r of rows) counts[r.status] = (counts[r.status] ?? 0) + 1;
        counts["open"] = rows.filter((r) => r.status !== "completed").length;
        counts["overdue"] = rows.filter((r) => isFollowUpOverdue(r, ctx.now)).length;
        counts["pendingConfirmation"] = rows.filter(
          (r) => r.clinicianConfirmation.status === "pending",
        ).length;
        counts["all"] = rows.length;
        return counts;
      });
    },

    createFollowUp(i: FollowUpCall, key: string): Promise<WriteResult<FollowUp>> {
      return engine.mutate({
        op: "createFollowUp",
        key,
        input: i,
        entityType: "follow_up",
        permission: "task.assign",
        schema: FollowUpInputSchema,
        run: async (ctx, input) => {
          const patient = await ctx.load<Patient>("patient", input.patientId);
          ctx.authorize(
            "task.assign",
            { facilityId: patient.facilityId, patientId: patient.id },
            { entityType: "patient", entityId: patient.id },
          );
          let parent: string | null = null;
          if (input.referralId) {
            const referral = await ctx.load<Referral>("referral", input.referralId);
            if (referral.patientId !== patient.id) {
              throw new RepositoryError("VALIDATION_ERROR", {
                fieldErrors: { referralId: { key: "invalid", params: {} } },
              });
            }
            parent = referral.id;
          }
          if (input.reviewId) {
            const review = await ctx.load<Review>("review", input.reviewId);
            if (review.patientId !== patient.id) {
              throw new RepositoryError("VALIDATION_ERROR", {
                fieldErrors: { reviewId: { key: "invalid", params: {} } },
              });
            }
            parent ??= review.id;
          }
          const followUp = await insertFollowUp(ctx, {
            patientId: patient.id,
            facilityId: patient.facilityId,
            purpose: input.purpose,
            dueAt: input.dueAt,
            assignedWorkerId: input.assignedWorkerId ?? null,
            referralId: input.referralId ?? null,
            reviewId: input.reviewId ?? null,
            note: input.note ?? null,
          });
          ctx.useCorrelation(parent ? await ctx.correlationOf(parent) : null);
          const event = await ctx.audit({
            action: "followup.created",
            entityType: "follow_up",
            entityId: followUp.id,
            after: followUp,
            changeSummary: {
              purpose: followUp.purpose,
              assigned: followUp.assignedWorkerId !== null,
            },
          });
          return {
            data: followUp,
            entityType: "follow_up",
            auditEventId: event.id,
            sync: { entityType: "follow_up", entityId: followUp.id, opType: "create" },
          };
        },
      });
    },

    updateFollowUp(i: FollowUpUpdateCall, key: string): Promise<WriteResult<FollowUp>> {
      return engine.mutate({
        op: "updateFollowUp",
        key,
        input: i,
        entityType: "follow_up",
        permission: null,
        schema: FollowUpUpdateInputSchema,
        run: async (ctx, input) => {
          const actor = ctx.requireActor();
          const fu = await ctx.load<FollowUp>("follow_up", input.followUpId);
          const resource = followUpResource(fu);
          const careTeam = CARE_TEAM_ACTIONS.has(input.action);
          ctx.authorize(careTeam ? "task.assign" : "followup.update", resource, {
            entityType: "follow_up",
            entityId: fu.id,
            // A CHW writing to a follow-up assigned to someone else (e.g. reassigned while
            // offline, HWM-08/10) gets the specific reason.
            scopeReason: "TASK_REASSIGNED",
          });
          await ctx.assertVersion("follow_up", fu, input.expectedVersion, resource);
          assertNotCompletedByReminder({ trigger: "user_action", entityType: "follow_up" });

          const move = (to: FollowUpStatus): FollowUpStatus => {
            if (to !== fu.status) assertFollowUpTransition(fu, to, input.action);
            return to;
          };
          let next: FollowUp;
          let action: AuditAction;
          let summary: Record<string, string | number | boolean | null> = { action: input.action };
          let justification: string | null = null;

          switch (input.action) {
            case "assign":
            case "reassign": {
              await assertAuthorisedWorker(ctx, fu.facilityId, input.assignedWorkerId);
              const status =
                input.action === "reassign" && fu.status === "unable_to_reach"
                  ? move("reassigned")
                  : fu.status;
              const reason = input.action === "reassign" ? input.reason : null;
              next = ctx.touch(fu, {
                assignedWorkerId: input.assignedWorkerId,
                dueAt: input.dueAt ?? fu.dueAt,
                status,
                assignmentHistory: [
                  ...fu.assignmentHistory,
                  {
                    workerId: input.assignedWorkerId,
                    assignedAt: ctx.nowIso,
                    assignedBy: actor.personaId,
                    reason,
                  },
                ],
              });
              action = input.action === "assign" ? "followup.assigned" : "followup.reassigned";
              justification = reason;
              summary = { ...summary, from: fu.assignedWorkerId, to: input.assignedWorkerId };
              break;
            }
            case "set_due_date":
              next = ctx.touch(fu, { dueAt: input.dueAt });
              action = "followup.due_date_changed";
              justification = input.reason;
              break;
            case "record_attempt": {
              const reached = input.result === "reached";
              const status =
                reached && (fu.status === "assigned" || fu.status === "reassigned")
                  ? move("contacted")
                  : fu.status;
              next = ctx.touch(fu, {
                status,
                attempts: [
                  ...fu.attempts,
                  {
                    id: asId<ContactAttemptId>(ctx.ids()),
                    at: input.at,
                    method: input.method,
                    result: input.result,
                    note: input.note ?? "",
                    durationMinutes: input.durationMinutes ?? null,
                    recordedBy: actor.personaId,
                  },
                ],
              });
              action = "followup.attempt_recorded";
              summary = {
                ...summary,
                method: input.method,
                result: input.result,
                at: input.at,
                baseVersion: input.expectedVersion,
              };
              break;
            }
            case "record_outcome": {
              const outcome = {
                kind: input.outcome,
                occurredAt: input.occurredAt,
                evidenceType: input.evidenceType ?? null,
                reasonCode: input.reasonCode ?? null,
                note: input.note ?? "",
                recordedBy: actor.personaId,
              };
              // PO 14: "referred onward" moves the task to `contacted`, never completes it.
              const to: FollowUpStatus =
                input.outcome === "referred_onward"
                  ? "contacted"
                  : input.outcome === "unable_to_reach"
                    ? "unable_to_reach"
                    : "completed";
              const status = move(to);
              const completed = status === "completed";
              next = ctx.touch(fu, {
                status,
                outcome,
                completedAt: completed ? input.occurredAt : fu.completedAt,
                // PO 7: worker-reported completion always awaits clinician confirmation.
                clinicianConfirmation: completed
                  ? CLINICAL_ROLES.has(actor.role)
                    ? { status: "confirmed", by: actor.personaId, at: ctx.nowIso }
                    : { status: "pending" }
                  : fu.clinicianConfirmation,
              });
              if (completed) assertCompletionEvidence(next);
              action = "followup.outcome_recorded";
              // HWM-08: outcome, evidence type, occurred-at and the base version it was recorded on.
              summary = {
                ...summary,
                outcome: input.outcome,
                status,
                evidenceType: outcome.evidenceType,
                reasonCode: outcome.reasonCode,
                occurredAt: input.occurredAt,
                baseVersion: input.expectedVersion,
              };
              break;
            }
            case "add_note":
              next = ctx.touch(fu, {
                notes: [...fu.notes, { at: ctx.nowIso, by: actor.personaId, text: input.note }],
              });
              action = "followup.note_added";
              break;
            case "confirm_completion":
              if (fu.status !== "completed" || fu.clinicianConfirmation.status !== "pending") {
                throw new RepositoryError("VALIDATION_ERROR", {
                  reason: "INVALID_TRANSITION",
                  details: { confirmation: fu.clinicianConfirmation.status, status: fu.status },
                });
              }
              next = ctx.touch(fu, {
                clinicianConfirmation: { status: "confirmed", by: actor.personaId, at: ctx.nowIso },
              });
              action = "followup.completion_confirmed";
              break;
            case "return_to_worker":
              assertFollowUpTransition(fu, "contacted", "return_to_worker");
              next = ctx.touch(fu, {
                status: "contacted",
                completedAt: null,
                clinicianConfirmation: {
                  status: "returned",
                  by: actor.personaId,
                  at: ctx.nowIso,
                  reason: input.reason,
                },
              });
              action = "followup.returned_to_worker";
              justification = input.reason;
              break;
          }
          await ctx.save("follow_up", next);
          ctx.useCorrelation(await ctx.correlationOf(fu.id));
          const event = await ctx.audit({
            action,
            entityType: "follow_up",
            entityId: fu.id,
            before: fu,
            after: next,
            changeSummary: summary,
            justification,
          });
          return {
            data: next,
            entityType: "follow_up",
            auditEventId: event.id,
            sync: { entityType: "follow_up", entityId: fu.id, opType: "update" },
          };
        },
      });
    },
  };
}
