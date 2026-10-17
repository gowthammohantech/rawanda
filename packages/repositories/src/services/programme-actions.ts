/**
 * Programme follow-up actions (ADM-03): non-clinical tasks for a facility manager (data
 * completeness check, supervision visit, …). Collection `programmeActions`, entity type
 * `programme_action`. No clinical record is ever read or written here.
 *
 * - `createProgrammeAction(input, key)` — `programme_action.write` in the facility's scope.
 *   Idempotent on the key (pipeline step c): a replay returns the original record and writes no
 *   second `admin.programme_action.created` event (only the cross-cutting
 *   `sync.duplicate_suppressed` trail of FND-07).
 * - `updateProgrammeAction(input, key)` — `expectedVersion` inside the input (FND-07 convention,
 *   not a separate argument): mismatch → `CONFLICT` with `latest` (+ `conflict.detected`);
 *   transitions follow the care-task machine (`open → in_progress → done`,
 *   `open | in_progress → cancelled_with_reason`); terminal actions cannot be edited.
 * - `listProgrammeActions(filter)` — `metrics.read`, restricted to the actor's scope.
 *
 * Denials use the canonical `access.denied` and conflicts `conflict.detected` (registry rule:
 * cross-cutting actions are never app-prefixed), both with entityType `programme_action`.
 */
import {
  createProgrammeActionInputSchema,
  createProgrammeActionUpdateInputSchema,
  isTerminalProgrammeActionStatus,
  ProgrammeActionFilterSchema,
  ProgrammeActionSchema,
  type ProgrammeAction,
  type ProgrammeActionFilter,
  type ProgrammeActionInputSchema,
  type ProgrammeActionUpdateInputSchema,
  type WriteResult,
} from "@laif/contracts";
import { careTaskMachine, type JsonValue } from "@laif/domain";
import type { z } from "zod";

import type { MutationInput } from "../care-repository.ts";
import type { Engine, TxContext } from "../core/engine.ts";
import { RepositoryError } from "../errors.ts";
import { parseFilter } from "./shared.ts";

export type ProgrammeActionCall = MutationInput<typeof ProgrammeActionInputSchema>;
export type ProgrammeActionUpdateCall = MutationInput<typeof ProgrammeActionUpdateInputSchema>;
export type ProgrammeActionFilterInput = z.input<typeof ProgrammeActionFilterSchema>;

const ENTITY = "programme_action" as const;

function resourceOf(action: Pick<ProgrammeAction, "facilityId" | "districtId">) {
  return { facilityId: action.facilityId, districtId: action.districtId };
}

/** Audit summary of an action (no free text: title / note stay in the record). */
function summaryOf(action: ProgrammeAction): { [key: string]: JsonValue } {
  return {
    category: action.category,
    facilityId: action.facilityId,
    dueDate: action.dueDate,
    status: action.status,
    version: action.version,
    sourcePage: action.sourceContext.page,
    stage: action.sourceContext.stage ?? null,
  };
}

async function loadAction(ctx: TxContext, id: string): Promise<ProgrammeAction> {
  const row = await ctx.find<unknown>(ENTITY, id);
  if (row === undefined) {
    throw new RepositoryError("NOT_FOUND", { details: { entityType: ENTITY, entityId: id } });
  }
  return ProgrammeActionSchema.parse(row);
}

export function createProgrammeActionService(engine: Engine) {
  return {
    listProgrammeActions(f?: ProgrammeActionFilterInput): Promise<ProgrammeAction[]> {
      return engine.read(async (ctx) => {
        ctx.authorize("metrics.read", undefined, { entityType: ENTITY, entityId: "list" });
        const filter: ProgrammeActionFilter = parseFilter(ProgrammeActionFilterSchema, f);
        const rows = (await ctx.all<unknown>(ENTITY)).map((row) =>
          ProgrammeActionSchema.parse(row),
        );
        return rows
          .filter(
            (a) =>
              ctx.can("metrics.read", resourceOf(a)) &&
              (!filter.facilityIds || (filter.facilityIds as string[]).includes(a.facilityId)) &&
              (!filter.districtIds || (filter.districtIds as string[]).includes(a.districtId)) &&
              (!filter.statuses || filter.statuses.includes(a.status)),
          )
          .sort((a, b) =>
            a.updatedAt === b.updatedAt
              ? a.id < b.id
                ? -1
                : 1
              : a.updatedAt > b.updatedAt
                ? -1
                : 1,
          );
      });
    },

    createProgrammeAction(
      i: ProgrammeActionCall,
      key: string,
    ): Promise<WriteResult<ProgrammeAction>> {
      return engine.mutate({
        op: "createProgrammeAction",
        key,
        input: i,
        entityType: ENTITY,
        permission: "programme_action.write",
        schema: (ctx) => Promise.resolve(createProgrammeActionInputSchema({ now: () => ctx.now })),
        run: async (ctx, input) => {
          const actor = ctx.requireActor();
          const facility = ctx.facilities.find((f) => f.id === input.facilityId);
          if (facility === undefined) {
            throw new RepositoryError("VALIDATION_ERROR", {
              fieldErrors: { facilityId: { key: "invalid", params: {} } },
            });
          }
          const districtId = facility.districtId;
          // The facility must be inside the actor's grant.
          ctx.authorize(
            "programme_action.write",
            { facilityId: facility.id, districtId },
            { entityType: ENTITY, entityId: "new" },
          );
          const action: ProgrammeAction = {
            id: ctx.ids(),
            idempotencyKey: input.idempotencyKey,
            facilityId: facility.id,
            districtId,
            category: input.category,
            title: input.title,
            note: input.note,
            ownerRole: "facility_manager",
            dueDate: input.dueDate,
            status: "open",
            createdBy: actor.personaId,
            updatedBy: actor.personaId,
            sourceContext: input.sourceContext,
            ...ctx.created(),
          };
          await ctx.save(ENTITY, action);
          ctx.useCorrelation(input.correlationId ?? null);
          const event = await ctx.audit({
            action: "admin.programme_action.created",
            entityType: ENTITY,
            entityId: action.id,
            facilityId: action.facilityId,
            districtId: action.districtId,
            after: action,
            changeSummary: summaryOf(action),
          });
          return { data: action, entityType: ENTITY, auditEventId: event.id, sync: null };
        },
      });
    },

    updateProgrammeAction(
      i: ProgrammeActionUpdateCall,
      key: string,
    ): Promise<WriteResult<ProgrammeAction>> {
      return engine.mutate({
        op: "updateProgrammeAction",
        key,
        input: i,
        entityType: ENTITY,
        permission: "programme_action.write",
        schema: (ctx) =>
          Promise.resolve(createProgrammeActionUpdateInputSchema({ now: () => ctx.now })),
        run: async (ctx, input) => {
          const actor = ctx.requireActor();
          const action = await loadAction(ctx, input.id);
          const resource = resourceOf(action);
          ctx.authorize("programme_action.write", resource, {
            entityType: ENTITY,
            entityId: action.id,
          });
          ctx.useCorrelation(input.correlationId ?? null);
          await ctx.assertVersion(ENTITY, action, input.expectedVersion, resource);
          if (isTerminalProgrammeActionStatus(action.status)) {
            throw new RepositoryError("VALIDATION_ERROR", {
              reason: "INVALID_TRANSITION",
              details: { machine: "programme_action", from: action.status, terminal: true },
            });
          }
          const status = input.status ?? action.status;
          if (status !== action.status) careTaskMachine.assert(action.status, status);
          const next: ProgrammeAction = ctx.touch(action, {
            status,
            title: input.title ?? action.title,
            note: input.note ?? action.note,
            dueDate: input.dueDate ?? action.dueDate,
            updatedBy: actor.personaId,
            ...(status === "cancelled_with_reason" && input.statusReason !== undefined
              ? { statusReason: input.statusReason }
              : {}),
          });
          await ctx.save(ENTITY, next);
          const event = await ctx.audit({
            action: "admin.programme_action.status_changed",
            entityType: ENTITY,
            entityId: action.id,
            facilityId: action.facilityId,
            districtId: action.districtId,
            before: action,
            after: next,
            changeSummary: {
              fromStatus: action.status,
              toStatus: next.status,
              fromVersion: action.version,
              toVersion: next.version,
              reapplied: input.reapplied ?? false,
              edited: [
                ...(input.title === undefined ? [] : ["title"]),
                ...(input.note === undefined ? [] : ["note"]),
                ...(input.dueDate === undefined ? [] : ["dueDate"]),
              ],
            },
            justification: status === "cancelled_with_reason" ? (input.statusReason ?? null) : null,
          });
          return { data: next, entityType: ENTITY, auditEventId: event.id, sync: null };
        },
      });
    },
  };
}
