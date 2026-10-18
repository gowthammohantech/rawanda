/**
 * Data-quality issues (ADM-06): detected issues + their programme triage state. Collection
 * `dataQualityIssues`, entity type `data_quality_issue`. No clinical record is ever written here:
 * corrections happen at source through amendment events (T-06, the original is kept).
 *
 * - `upsertDetectedIssues(issues)` — `metrics.read`; every issue's facility must be inside the
 *   actor's scope (`FORBIDDEN` otherwise). Inserts NEW ids only (status `open`, version 1) and
 *   never resets the triage of an existing id, so running detection twice gives the same count.
 *   One system audit `admin.quality_issue.detected` (actor = system) per new id. Not an
 *   idempotency-keyed mutation: it is idempotent by id, and a keyed replay would add
 *   `sync.duplicate_suppressed` events (the "duplicates prevented" metric).
 * - `triageQualityIssue(input, key)` — `quality.triage` in the issue's scope; idempotent on the
 *   key; `expectedVersion` inside the input (FND-07 convention): stale → `CONFLICT` with `latest`
 *   (+ `conflict.detected`). `send_to_facility` additionally needs `programme_action.write` and a
 *   programme action of the same facility. Audit `admin.quality_issue.triaged` with before /
 *   after status, the note LENGTH (never the note text), actor, role, facility, correlation.
 * - `listQualityIssues(filter)` — `metrics.read`, restricted to the actor's scope.
 *
 * Denials use the canonical `access.denied` and conflicts `conflict.detected` (registry rule:
 * cross-cutting actions are never app-prefixed), both with entityType `data_quality_issue`.
 */
import {
  canTransitionQualityIssue,
  contractsErrorMap,
  issuesToFieldErrors,
  DataQualityIssueSchema,
  DetectedQualityIssueSchema,
  isTerminalQualityIssueStatus,
  ProgrammeActionSchema,
  QualityIssueFilterSchema,
  TRIAGE_TARGET_STATUS,
  TriageInputSchema,
  type DataQualityIssue,
  type DetectedQualityIssue,
  type QualityIssueFilter,
  type TriageHistoryEntry,
  type WriteResult,
} from "@laif/contracts";
import { z } from "zod";

import type { MutationInput } from "../care-repository.ts";
import type { Engine, TxContext } from "../core/engine.ts";
import { RepositoryError } from "../errors.ts";
import { parseFilter } from "./shared.ts";

export type QualityIssueFilterInput = z.input<typeof QualityIssueFilterSchema>;
export type TriageQualityIssueCall = MutationInput<typeof TriageInputSchema>;
export type UpsertDetectedIssuesResult = { inserted: string[]; total: number };

const ENTITY = "data_quality_issue" as const;

function resourceOf(issue: Pick<DataQualityIssue, "facilityId" | "districtId">) {
  return { facilityId: issue.facilityId, districtId: issue.districtId };
}

async function loadIssue(ctx: TxContext, id: string): Promise<DataQualityIssue> {
  const row = await ctx.find<unknown>(ENTITY, id);
  if (row === undefined) {
    throw new RepositoryError("NOT_FOUND", { details: { entityType: ENTITY, entityId: id } });
  }
  return DataQualityIssueSchema.parse(row);
}

const DetectedListSchema = z.array(DetectedQualityIssueSchema).max(5000);

export function createQualityIssueService(engine: Engine) {
  return {
    listQualityIssues(f?: QualityIssueFilterInput): Promise<DataQualityIssue[]> {
      return engine.read(async (ctx) => {
        ctx.authorize("metrics.read", undefined, { entityType: ENTITY, entityId: "list" });
        const filter: QualityIssueFilter = parseFilter(QualityIssueFilterSchema, f);
        const ids = filter.ids === undefined ? null : new Set(filter.ids);
        const rows = (await ctx.all<unknown>(ENTITY)).map((row) =>
          DataQualityIssueSchema.parse(row),
        );
        return rows
          .filter(
            (i) =>
              ctx.can("metrics.read", resourceOf(i)) &&
              (ids === null || ids.has(i.id)) &&
              (!filter.facilityIds || (filter.facilityIds as string[]).includes(i.facilityId)) &&
              (!filter.districtIds || (filter.districtIds as string[]).includes(i.districtId)) &&
              (!filter.statuses || filter.statuses.includes(i.status)) &&
              (!filter.types || filter.types.includes(i.type)),
          )
          .sort((a, b) =>
            a.detectedAt === b.detectedAt
              ? a.id < b.id
                ? -1
                : 1
              : a.detectedAt > b.detectedAt
                ? -1
                : 1,
          );
      });
    },

    upsertDetectedIssues(issues: readonly unknown[]): Promise<UpsertDetectedIssuesResult> {
      return engine.write(async (ctx) => {
        ctx.authorize("metrics.read", undefined, { entityType: ENTITY, entityId: "detect" });
        const parsed = DetectedListSchema.safeParse(issues, { error: contractsErrorMap });
        if (!parsed.success) {
          throw new RepositoryError("VALIDATION_ERROR", {
            fieldErrors: issuesToFieldErrors(parsed.error.issues),
          });
        }
        const detected: DetectedQualityIssue[] = parsed.data;
        // Scope first: nothing is written when any issue is outside the grant.
        for (const issue of detected) {
          if (ctx.facilityToDistrict[issue.facilityId] !== issue.districtId) {
            throw new RepositoryError("VALIDATION_ERROR", {
              fieldErrors: { districtId: { key: "invalid", params: {} } },
            });
          }
          ctx.authorize("metrics.read", resourceOf(issue), {
            entityType: ENTITY,
            entityId: issue.id,
          });
        }
        const inserted: string[] = [];
        const seen = new Set<string>();
        for (const issue of detected) {
          if (seen.has(issue.id)) continue;
          seen.add(issue.id);
          if ((await ctx.find<unknown>(ENTITY, issue.id)) !== undefined) continue;
          const record: DataQualityIssue = {
            ...issue,
            status: "open",
            note: null,
            programmeActionId: null,
            updatedBy: null,
            history: [],
            ...ctx.created(),
          };
          await ctx.save(ENTITY, record);
          await ctx.audit({
            action: "admin.quality_issue.detected",
            entityType: ENTITY,
            entityId: record.id,
            facilityId: record.facilityId,
            districtId: record.districtId,
            actor: { actorId: null, actorRole: null },
            changeSummary: {
              type: record.type,
              rule: record.details.rule,
              subjectRef: record.subjectRef,
              detectedAt: record.detectedAt,
            },
          });
          inserted.push(record.id);
        }
        return { inserted, total: seen.size };
      });
    },

    triageQualityIssue(
      i: TriageQualityIssueCall,
      key: string,
    ): Promise<WriteResult<DataQualityIssue>> {
      return engine.mutate({
        op: "triageQualityIssue",
        key,
        input: i,
        entityType: ENTITY,
        permission: "quality.triage",
        schema: TriageInputSchema,
        run: async (ctx, input) => {
          const actor = ctx.requireActor();
          const issue = await loadIssue(ctx, input.id);
          const resource = resourceOf(issue);
          ctx.authorize("quality.triage", resource, { entityType: ENTITY, entityId: issue.id });
          ctx.useCorrelation(input.correlationId ?? null);
          await ctx.assertVersion(ENTITY, issue, input.expectedVersion, resource);
          const toStatus = TRIAGE_TARGET_STATUS[input.action];
          if (
            isTerminalQualityIssueStatus(issue.status) ||
            !canTransitionQualityIssue(issue.status, toStatus)
          ) {
            throw new RepositoryError("VALIDATION_ERROR", {
              reason: "INVALID_TRANSITION",
              details: { machine: "data_quality_issue", from: issue.status, to: toStatus },
            });
          }
          let programmeActionId = issue.programmeActionId;
          if (input.action === "send_to_facility") {
            ctx.authorize("programme_action.write", resource, {
              entityType: ENTITY,
              entityId: issue.id,
            });
            const row = await ctx.find<unknown>("programme_action", input.programmeActionId);
            const action = row === undefined ? null : ProgrammeActionSchema.parse(row);
            if (action === null || action.facilityId !== issue.facilityId) {
              throw new RepositoryError("VALIDATION_ERROR", {
                fieldErrors: { programmeActionId: { key: "invalid", params: {} } },
              });
            }
            programmeActionId = action.id;
          }
          const noteLength = input.action === "resolve" ? input.note.length : null;
          const entry: TriageHistoryEntry = {
            at: ctx.nowIso,
            by: actor.personaId,
            role: actor.role,
            action: input.action,
            fromStatus: issue.status,
            toStatus,
            noteLength,
            programmeActionId: input.action === "send_to_facility" ? programmeActionId : null,
          };
          const next: DataQualityIssue = ctx.touch(issue, {
            status: toStatus,
            note: input.action === "resolve" ? input.note : issue.note,
            programmeActionId,
            updatedBy: actor.personaId,
            history: [...issue.history, entry],
          });
          await ctx.save(ENTITY, next);
          const event = await ctx.audit({
            action: "admin.quality_issue.triaged",
            entityType: ENTITY,
            entityId: issue.id,
            facilityId: issue.facilityId,
            districtId: issue.districtId,
            // Status only: the note text stays on the record, never in the audit log.
            before: { status: issue.status, version: issue.version },
            after: { status: next.status, version: next.version },
            changeSummary: {
              action: input.action,
              type: issue.type,
              fromStatus: issue.status,
              toStatus,
              fromVersion: issue.version,
              toVersion: next.version,
              noteLength,
              programmeActionId: entry.programmeActionId,
              actorRole: actor.role,
            },
          });
          return { data: next, entityType: ENTITY, auditEventId: event.id, sync: null };
        },
      });
    },
  };
}
