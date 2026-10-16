/**
 * Audit log reads (CL-08, PA audit views) and the two audit-only writes: `recordAuditEvent`
 * (UI-originated access / session / demo events — replaces app-proposed `appendAudit` /
 * `auditLocal` / `emitAdminAudit` sinks) and `recordExport` (`export.generated`).
 */
import {
  AuditFilterSchema,
  ClientAuditInputSchema,
  contractsErrorMap,
  ExportRecordInputSchema,
  issuesToFieldErrors,
  type ClientAuditInput,
  type Page,
  type WriteResult,
} from "@laif/contracts";
import type { AuditEvent, EntityType } from "@laif/domain";

import { isClientAuditAction } from "../audit/actions.ts";
import type { AuditFilterInput, ExportRecordCall } from "../care-repository.ts";
import type { Engine } from "../core/engine.ts";
import { RepositoryError } from "../errors.ts";
import { paginate, parseFilter, READ_PERMISSIONS, readPermission, sortBy } from "./shared.ts";

export function createAuditService(engine: Engine) {
  return {
    /** Newest first. Audited as `audit.viewed` (de-duplicated per actor per minute). */
    listAuditEvents(f?: AuditFilterInput): Promise<Page<AuditEvent>> {
      return engine.read(async (ctx) => {
        const filter = parseFilter(AuditFilterSchema, f);
        const permission = readPermission(ctx, READ_PERMISSIONS.audit, {
          entityType: "audit_event",
          entityId: "log",
        });
        for (const facilityId of filter.facilityIds ?? []) {
          ctx.authorize(
            permission,
            { facilityId },
            { entityType: "facility", entityId: facilityId },
          );
        }
        for (const districtId of filter.districtIds ?? []) {
          ctx.authorize(
            permission,
            { districtId },
            { entityType: "district", entityId: districtId },
          );
        }
        const action = filter.action;
        const rows = (await ctx.tx.getAll<AuditEvent>("auditEvents")).filter(
          (e) =>
            ctx.can(permission, {
              facilityId: e.facilityId,
              districtId: e.districtId,
              patientId: e.patientId,
            }) &&
            (!action ||
              e.action === action ||
              (action.endsWith(".") && e.action.startsWith(action))) &&
            (!filter.actorId || e.actorId === filter.actorId) &&
            (!filter.actorRole || e.actorRole === filter.actorRole) &&
            (!filter.categories || filter.categories.includes(e.category)) &&
            (!filter.outcome || e.outcome === filter.outcome) &&
            (!filter.entityType || e.entityType === filter.entityType) &&
            (!filter.entityId || e.entityId === filter.entityId) &&
            (!filter.patientId || e.patientId === filter.patientId) &&
            (!filter.correlationId || e.correlationId === filter.correlationId) &&
            (!filter.facilityIds ||
              (e.facilityId !== null && (filter.facilityIds as string[]).includes(e.facilityId))) &&
            (!filter.districtIds ||
              (e.districtId !== null && (filter.districtIds as string[]).includes(e.districtId))) &&
            (!filter.from || e.occurredAt >= filter.from) &&
            (!filter.to || e.occurredAt <= filter.to),
        );
        await ctx.auditAccess({
          action: "audit.viewed",
          entityType: "audit_event",
          entityId: "log",
          changeSummary: { results: rows.length },
        });
        return paginate(
          sortBy(rows, (e) => e.occurredAt, "desc"),
          filter.page,
          filter.pageSize,
        );
      });
    },

    recordAuditEvent(i: ClientAuditInput): Promise<AuditEvent> {
      return engine.write(async (ctx) => {
        const parsed = ClientAuditInputSchema.safeParse(i, { error: contractsErrorMap });
        if (!parsed.success) {
          throw new RepositoryError("VALIDATION_ERROR", {
            fieldErrors: issuesToFieldErrors(parsed.error.issues),
          });
        }
        const input = parsed.data;
        if (!isClientAuditAction(input.action)) {
          throw new RepositoryError("VALIDATION_ERROR", {
            fieldErrors: { action: { key: "invalidEnum", params: {} } },
            details: { action: input.action },
          });
        }
        const sessionEvent = input.action.startsWith("session.");
        const entityType: EntityType =
          input.entityType ?? (sessionEvent && ctx.actorId ? "persona" : "audit_event");
        const entityId =
          input.entityId ?? (entityType === "persona" && ctx.actorId ? ctx.actorId : "client");
        return ctx.audit({
          action: input.action,
          entityType,
          entityId,
          outcome: input.outcome,
          facilityId: input.facilityId ?? null,
          districtId: input.districtId ?? null,
          patientId: input.patientId ?? null,
          changeSummary: { ...input.changeSummary, origin: "client" },
          justification: input.justification ?? null,
        });
      });
    },

    recordExport(i: ExportRecordCall, key: string): Promise<WriteResult<AuditEvent>> {
      return engine.mutate({
        op: "recordExport",
        key,
        input: i,
        entityType: "audit_event",
        permission: null,
        schema: ExportRecordInputSchema,
        run: async (ctx, input) => {
          const permission = input.template.startsWith("audit")
            ? "audit.export"
            : "export.aggregate";
          const target = {
            entityType: "audit_event" as const,
            entityId: "export",
            denyAction: "export.denied" as const,
          };
          ctx.authorize(permission, undefined, target);
          for (const facilityId of input.scope.facilityIds) {
            ctx.authorize(
              permission,
              { facilityId },
              { ...target, entityType: "facility", entityId: facilityId },
            );
          }
          for (const districtId of input.scope.districtIds) {
            ctx.authorize(
              permission,
              { districtId },
              { ...target, entityType: "district", entityId: districtId },
            );
          }
          const exportId = ctx.ids();
          ctx.useCorrelation(null);
          const event = await ctx.audit({
            action: "export.generated",
            entityType: "audit_event",
            entityId: exportId,
            changeSummary: {
              template: input.template,
              granularity: input.granularity,
              reasonCode: input.reasonCode,
              districtIds: input.scope.districtIds,
              facilityIds: input.scope.facilityIds,
              filters: input.filters,
              rowCount: input.rowCount,
              suppressedCells: input.suppressedCells,
              sha256: input.sha256,
            },
            justification: input.reasonText ?? null,
          });
          return { data: event, entityType: "audit_event", auditEventId: event.id, sync: null };
        },
      });
    },
  };
}
