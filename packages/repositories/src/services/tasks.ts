/**
 * Care tasks (CLN-09, ADM, CTZ-08) and correction requests. A correction request creates a
 * `correction_request` task and NEVER edits the clinical record (WF-04.4).
 */
import {
  CareTaskInputSchema,
  CareTaskUpdateInputSchema,
  CorrectionRequestInputSchema,
  TaskFilterSchema,
  type Page,
  type WriteResult,
} from "@laif/contracts";
import {
  asId,
  careTaskMachine,
  CORRECTION_RESOLUTION_STATUS,
  type CareTask,
  type CareTaskId,
  type CareTaskStatus,
  type CorrectionRequestPayload,
  type CorrectionRequestStatus,
  type CorrectionResolutionKey,
  type Patient,
} from "@laif/domain";
import { roleHasPermission } from "@laif/auth-demo";

import type {
  CareTaskCall,
  CareTaskUpdateCall,
  CorrectionRequestCall,
  TaskFilterInput,
} from "../care-repository.ts";
import type { Engine, TxContext } from "../core/engine.ts";
import { RepositoryError } from "../errors.ts";
import {
  assertRequestedScope,
  paginate,
  parseFilter,
  READ_PERMISSIONS,
  readPermission,
  sortBy,
  taskResource,
} from "./shared.ts";

async function patientOf(ctx: TxContext, id: string | undefined): Promise<Patient | null> {
  if (id === undefined) return null;
  const patient = await ctx.find<Patient>("patient", id);
  if (!patient) {
    throw new RepositoryError("VALIDATION_ERROR", {
      fieldErrors: { patientId: { key: "invalid", params: {} } },
    });
  }
  return patient;
}

/**
 * CLN-09: keeps the citizen-visible state of a routed correction request (`payload.requestStatus`,
 * set by CTZ-07) in step with the task: start → `in_review`, complete → the status implied by the
 * staff `resolutionKey` (vocabulary) or `resolved_no_change`. Other kinds / unrouted requests: no
 * payload change.
 */
function correctionPayload(
  task: CareTask,
  requestStatus: CorrectionRequestStatus,
  resolutionKey?: CorrectionResolutionKey,
): { payload?: CorrectionRequestPayload } {
  if (task.kind !== "correction_request") return {};
  if (task.payload.requestStatus === undefined && resolutionKey === undefined) return {};
  return {
    payload: {
      ...task.payload,
      requestStatus,
      ...(resolutionKey === undefined ? {} : { resolutionKey }),
    },
  };
}

export function createTaskService(engine: Engine) {
  return {
    listTasks(f?: TaskFilterInput): Promise<Page<CareTask>> {
      return engine.read(async (ctx) => {
        const filter = parseFilter(TaskFilterSchema, f);
        const permission = readPermission(ctx, READ_PERMISSIONS.task, {
          entityType: "care_task",
          entityId: "list",
        });
        assertRequestedScope(ctx, permission, filter);
        const rows = (await ctx.all<CareTask>("care_task")).filter(
          (t) =>
            ctx.can(permission, taskResource(t)) &&
            (!filter.kinds || filter.kinds.includes(t.kind)) &&
            (!filter.statuses || filter.statuses.includes(t.status)) &&
            (filter.assignedToId === undefined || t.assignedToId === filter.assignedToId) &&
            (!filter.patientId || t.patientId === filter.patientId) &&
            (!filter.facilityIds ||
              (t.facilityId !== null && (filter.facilityIds as string[]).includes(t.facilityId))),
        );
        return paginate(
          sortBy(rows, (t) => t.createdAt, "desc"),
          filter.page,
          filter.pageSize,
        );
      });
    },

    createTask(
      i: CareTaskCall,
      key: string,
      options: { presetId?: string } = {},
    ): Promise<WriteResult<CareTask>> {
      return engine.mutate({
        op: "createTask",
        key,
        // CareTaskInputSchema carries no idempotency key; the pipeline adds `key` and the
        // object schema strips it.
        input: i,
        entityType: "care_task",
        permission: "task.assign",
        schema: CareTaskInputSchema,
        run: async (ctx, input) => {
          const actor = ctx.requireActor();
          const patient = await patientOf(ctx, input.patientId);
          const facilityId = input.facilityId ?? patient?.facilityId ?? null;
          ctx.authorize(
            "task.assign",
            { facilityId, patientId: patient?.id ?? null },
            { entityType: "care_task", entityId: options.presetId ?? "new" },
          );
          const task = {
            id: asId<CareTaskId>(options.presetId ?? ctx.ids()),
            kind: input.kind,
            payload: input.payload,
            status: "open",
            patientId: patient?.id ?? null,
            facilityId,
            assignedToId: input.assignedToId ?? null,
            createdBy: actor.personaId,
            dueAt: input.dueAt ?? null,
            completedAt: null,
            cancelled: null,
            ...ctx.created(),
          } as CareTask;
          await ctx.save("care_task", task);
          ctx.useCorrelation(null);
          const event = await ctx.audit({
            action: "task.created",
            entityType: "care_task",
            entityId: task.id,
            after: task,
            changeSummary: { kind: task.kind },
          });
          return {
            data: task,
            entityType: "care_task",
            auditEventId: event.id,
            sync: { entityType: "care_task", entityId: task.id, opType: "create" },
          };
        },
      });
    },

    updateTask(i: CareTaskUpdateCall, key: string): Promise<WriteResult<CareTask>> {
      return engine.mutate({
        op: "updateTask",
        key,
        input: i,
        entityType: "care_task",
        permission: null,
        schema: CareTaskUpdateInputSchema,
        run: async (ctx, input) => {
          const actor = ctx.requireActor();
          const task = await ctx.load<CareTask>("care_task", input.taskId);
          const resource = taskResource(task);
          // The assignee may work their own task; everything else needs `task.assign`.
          const own =
            input.action !== "assign" &&
            task.assignedToId === actor.personaId &&
            roleHasPermission(actor.role, "task.read");
          ctx.authorize(own ? "task.read" : "task.assign", resource, {
            entityType: "care_task",
            entityId: task.id,
          });
          await ctx.assertVersion("care_task", task, input.expectedVersion, resource);
          const move = (to: CareTaskStatus): CareTaskStatus => {
            careTaskMachine.assert(task.status, to);
            return to;
          };
          let next: CareTask;
          let justification: string | null = null;
          switch (input.action) {
            case "start":
              next = ctx.touch(task, {
                status: move("in_progress"),
                ...correctionPayload(task, "in_review"),
              });
              break;
            case "complete": {
              if (input.resolutionKey !== undefined && task.kind !== "correction_request") {
                throw new RepositoryError("VALIDATION_ERROR", {
                  fieldErrors: { resolutionKey: { key: "invalid", params: {} } },
                });
              }
              const resolved =
                input.resolutionKey === undefined
                  ? correctionPayload(task, "resolved_no_change")
                  : correctionPayload(
                      task,
                      CORRECTION_RESOLUTION_STATUS[input.resolutionKey],
                      input.resolutionKey,
                    );
              next = ctx.touch(task, {
                status: move("done"),
                completedAt: ctx.nowIso,
                ...resolved,
              });
              break;
            }
            case "cancel":
              next = ctx.touch(task, {
                status: move("cancelled_with_reason"),
                cancelled: { reason: input.reason },
              });
              justification = input.reason;
              break;
            case "assign":
              next = ctx.touch(task, {
                assignedToId: input.assignedToId,
                dueAt: input.dueAt === undefined ? task.dueAt : input.dueAt,
              });
              break;
          }
          await ctx.save("care_task", next);
          ctx.useCorrelation(await ctx.correlationOf(task.id));
          const event = await ctx.audit({
            action: "task.updated",
            entityType: "care_task",
            entityId: task.id,
            before: task,
            after: next,
            changeSummary: {
              action: input.action,
              from: task.status,
              to: next.status,
              ...(input.action === "complete" && input.resolutionKey !== undefined
                ? { resolutionKey: input.resolutionKey }
                : {}),
            },
            justification,
          });
          return {
            data: next,
            entityType: "care_task",
            auditEventId: event.id,
            sync: { entityType: "care_task", entityId: task.id, opType: "update" },
          };
        },
      });
    },

    requestCorrection(
      i: CorrectionRequestCall,
      key: string,
      options: { presetId?: string } = {},
    ): Promise<WriteResult<CareTask>> {
      return engine.mutate({
        op: "requestCorrection",
        key,
        input: i,
        entityType: "care_task",
        permission: null,
        schema: CorrectionRequestInputSchema,
        run: async (ctx, input) => {
          const actor = ctx.requireActor();
          const patient = await patientOf(ctx, input.patientId);
          const permission = roleHasPermission(actor.role, "self.correction.request")
            ? "self.correction.request"
            : "task.read";
          ctx.authorize(
            permission,
            {
              facilityId: patient?.facilityId ?? null,
              districtId: patient?.districtId ?? null,
              patientId: patient?.id ?? null,
            },
            { entityType: "patient", entityId: input.patientId },
          );
          const task = {
            id: asId<CareTaskId>(options.presetId ?? ctx.ids()),
            kind: "correction_request",
            payload: {
              targetType: input.targetType,
              targetId: input.targetId,
              description: input.description,
              suggestedValue: input.suggestedValue,
            },
            status: "open",
            patientId: patient?.id ?? null,
            facilityId: patient?.facilityId ?? null,
            assignedToId: null,
            createdBy: actor.personaId,
            dueAt: null,
            completedAt: null,
            cancelled: null,
            ...ctx.created(),
          } as CareTask;
          await ctx.save("care_task", task);
          ctx.useCorrelation(await ctx.correlationOf(input.targetId));
          const event = await ctx.audit({
            action: "correction.requested",
            entityType: "care_task",
            entityId: task.id,
            after: task,
            changeSummary: { targetType: input.targetType, targetId: input.targetId },
          });
          return {
            data: task,
            entityType: "care_task",
            auditEventId: event.id,
            sync: { entityType: "care_task", entityId: task.id, opType: "create" },
          };
        },
      });
    },
  };
}
