/**
 * Audit log reads (CL-08, PA audit views) and the two audit-only writes: `recordAuditEvent`
 * (UI-originated access / session / demo events — replaces app-proposed `appendAudit` /
 * `auditLocal` / `emitAdminAudit` sinks) and `recordExport` (`export.generated`), plus the ADM-07
 * export history (`listExportAudits`).
 */
import { checkAccess } from "@laif/auth-demo";
import {
  AuditFilterSchema,
  ClientAuditInputSchema,
  contractsErrorMap,
  ExportAuditFilterSchema,
  ExportAuditSchema,
  ExportRecordInputSchema,
  issuesToFieldErrors,
  type ClientAuditInput,
  type ExportAudit,
  type ExportDenialReason,
  type Page,
  type WriteResult,
} from "@laif/contracts";
import type { AuditEvent, DistrictId, EntityType, FacilityId } from "@laif/domain";
import type { z } from "zod";

import { isClientAuditAction } from "../audit/actions.ts";
import type { AuditFilterInput, ExportRecordCall } from "../care-repository.ts";
import { defer, deferRecord, type Engine } from "../core/engine.ts";
import { RepositoryError } from "../errors.ts";
import { paginate, parseFilter, READ_PERMISSIONS, readPermission, sortBy } from "./shared.ts";

export type ExportAuditFilterInput = z.input<typeof ExportAuditFilterSchema>;

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
          ...(input.correlationId === undefined ? {} : { correlationId: input.correlationId }),
        });
      });
    },

    /**
     * Aggregate export (ADM-07 extension of FND-07): `export.aggregate` (`audit.export` for an
     * `audit*` template) checked on the role, then on EVERY requested district / facility.
     * - Allowed → one ExportAudit `generated` (collection `exportAudits`, id = `exportId`, the CSV
     *   bytes kept for idempotent re-downloads) + `export.generated`; a replay of the key returns
     *   the stored result (no second record, no second `export.generated`).
     * - Denied → `FORBIDDEN` (reason `ROLE` / `SCOPE`) + `export.denied` (denial `capability` /
     *   `scope`, requested scope) AND an ExportAudit `denied` row, both written after the
     *   rollback, so access reports include failures. No file.
     */
    recordExport(i: ExportRecordCall, key: string): Promise<WriteResult<AuditEvent>> {
      return engine.mutate({
        op: "recordExport",
        key,
        input: i,
        entityType: "export_audit",
        permission: null,
        schema: ExportRecordInputSchema,
        run: async (ctx, input) => {
          const permission = input.template.startsWith("audit")
            ? "audit.export"
            : "export.aggregate";
          const actor = ctx.actor;
          const correlationId = ctx.useCorrelation(input.correlationId ?? null);
          const exportId = input.exportId ?? ctx.ids();
          const requested = {
            districtIds: input.scope.districtIds,
            facilityIds: input.scope.facilityIds,
          };
          const base = {
            ...ctx.created(),
            idempotencyKey: input.idempotencyKey,
            actorId: actor?.personaId ?? null,
            role: actor?.role ?? null,
            grantId: input.grantId ?? null,
            correlationId,
            scope: requested,
            period: input.period ?? null,
            template: input.template,
            granularity: input.granularity,
            reasonCode: input.reasonCode,
            reasonText: input.reasonText ?? null,
          };
          const summary = {
            template: input.template,
            granularity: input.granularity,
            reasonCode: input.reasonCode,
            districtIds: input.scope.districtIds,
            facilityIds: input.scope.facilityIds,
            period: input.period ?? null,
            filters: input.filters,
            grantId: input.grantId ?? null,
            idempotencyKey: input.idempotencyKey,
          };
          const denyExport = (
            denial: ExportDenialReason,
            reason: "ROLE" | "SCOPE",
            resource: { facilityId?: FacilityId; districtId?: DistrictId } = {},
          ): never => {
            const record: ExportAudit = {
              ...base,
              id: ctx.ids(),
              rowCount: 0,
              suppressedCells: 0,
              sha256: null,
              fileName: null,
              csvText: null,
              status: "denied",
              deniedReason: denial,
            };
            const error = new RepositoryError("FORBIDDEN", {
              reason,
              details: { permission, denial, exportAuditId: record.id },
            });
            deferRecord(error, { collection: "exportAudits", record });
            throw defer(error, {
              action: "export.denied",
              entityType: "export_audit",
              entityId: record.id,
              outcome: "denied",
              ...ctx.scopeOf(resource),
              correlationId,
              changeSummary: { ...summary, permission, reason, denial, requested },
              justification: input.reasonText ?? input.reasonCode,
              actorId: actor?.personaId ?? null,
              actorRole: actor?.role ?? null,
              occurredAt: ctx.nowIso,
            });
          };
          if (actor === null || !checkAccess(actor, permission).allowed) {
            return denyExport("capability", "ROLE");
          }
          for (const facilityId of input.scope.facilityIds) {
            if (!ctx.can(permission, { facilityId })) {
              return denyExport("scope", "SCOPE", { facilityId });
            }
          }
          for (const districtId of input.scope.districtIds) {
            if (!ctx.can(permission, { districtId })) {
              return denyExport("scope", "SCOPE", { districtId });
            }
          }
          if ((await ctx.find<unknown>("export_audit", exportId)) !== undefined) {
            throw new RepositoryError("VALIDATION_ERROR", {
              fieldErrors: { exportId: { key: "invalid", params: {} } },
            });
          }
          const record: ExportAudit = {
            ...base,
            id: exportId,
            rowCount: input.rowCount,
            suppressedCells: input.suppressedCells,
            sha256: input.sha256,
            fileName: input.fileName ?? null,
            csvText: input.csvText ?? null,
            status: "generated",
            deniedReason: null,
          };
          await ctx.save("export_audit", ExportAuditSchema.parse(record));
          const event = await ctx.audit({
            action: "export.generated",
            entityType: "export_audit",
            entityId: exportId,
            changeSummary: {
              ...summary,
              exportId,
              actorRole: actor.role,
              rowCount: input.rowCount,
              suppressedCells: input.suppressedCells,
              sha256: input.sha256,
              fileName: input.fileName ?? null,
            },
            justification: input.reasonText ?? input.reasonCode,
          });
          return { data: event, entityType: "audit_event", auditEventId: event.id, sync: null };
        },
      });
    },

    /**
     * Export history (ADM-07 task 9), newest first: the actor's own attempts (generated and
     * denied), plus — for governance readers (`audit.read` / `audit.read_scoped`) — every other
     * export whose districts / facilities all lie inside the actor's scope. `metrics.read`.
     */
    listExportAudits(f?: ExportAuditFilterInput): Promise<ExportAudit[]> {
      return engine.read(async (ctx) => {
        ctx.authorize("metrics.read", undefined, { entityType: "export_audit", entityId: "list" });
        const filter = parseFilter(ExportAuditFilterSchema, f);
        const actor = ctx.actor;
        const governance =
          actor !== null &&
          (checkAccess(actor, "audit.read").allowed ||
            checkAccess(actor, "audit.read_scoped").allowed);
        const ids = filter.ids === undefined ? null : new Set(filter.ids);
        const rows = (await ctx.all<unknown>("export_audit")).map((row) =>
          ExportAuditSchema.parse(row),
        );
        return rows
          .filter((r) => {
            const own = actor !== null && r.actorId === actor.personaId;
            const inScope =
              r.scope.districtIds.every((districtId) => ctx.can("metrics.read", { districtId })) &&
              r.scope.facilityIds.every((facilityId) => ctx.can("metrics.read", { facilityId }));
            return (
              (own || (governance && inScope)) &&
              (ids === null || ids.has(r.id)) &&
              (filter.idempotencyKey === undefined || r.idempotencyKey === filter.idempotencyKey) &&
              (filter.statuses === undefined || filter.statuses.includes(r.status))
            );
          })
          .sort((a, b) =>
            a.createdAt === b.createdAt
              ? a.id < b.id
                ? 1
                : -1
              : a.createdAt > b.createdAt
                ? -1
                : 1,
          );
      });
    },
  };
}
