/**
 * Screenings: drafts (device-local, never synced), submission with evaluation by the ruleset
 * STORED WITH THE DATASET (FND-07 task 5) and review creation, append-only amendments.
 */
import {
  createScreeningAmendmentInputSchema,
  createScreeningInputSchema,
  IdempotencyKey,
  ScreeningDraftInputSchema,
  ScreeningFilterSchema,
  type Page,
  type WriteResult,
} from "@laif/contracts";
import {
  applyAmendment,
  asId,
  assertScreeningMutable,
  evaluateScreening,
  updateScreeningDraft,
  type DemoRuleset,
  type Patient,
  type Review,
  type ReviewId,
  type Screening,
  type ScreeningAmendmentId,
  type ScreeningDraftPatch,
  type ScreeningId,
} from "@laif/domain";
import { z } from "zod";

import type {
  ScreeningAmendmentCall,
  ScreeningCall,
  ScreeningDraftCall,
  ScreeningFilterInput,
} from "../care-repository.ts";
import type { Engine, TxContext } from "../core/engine.ts";
import { RepositoryError } from "../errors.ts";
import {
  assertRequestedScope,
  paginate,
  parseFilter,
  READ_PERMISSIONS,
  readPermission,
  screeningResource,
  sortBy,
} from "./shared.ts";

type StoredRuleset = DemoRuleset & { id: string };

/**
 * The active ruleset stored with the dataset (latest `effectiveFrom` ≤ now with status
 * `active`); `deps.ruleset` overrides it in tests. Never a code constant.
 */
export async function activeRuleset(ctx: TxContext): Promise<DemoRuleset> {
  if (ctx.engine.rulesetOverride) return ctx.engine.rulesetOverride;
  const candidates = (await ctx.tx.getAll<StoredRuleset>("rulesets")).filter(
    (r) => r.status === "active" && Date.parse(r.effectiveFrom) <= ctx.now.getTime(),
  );
  const latest = candidates.sort((a, b) => (a.effectiveFrom < b.effectiveFrom ? 1 : -1))[0];
  if (!latest) {
    throw new RepositoryError("DEPENDENCY_UNAVAILABLE", { details: { missing: "ruleset" } });
  }
  const { id, ...ruleset } = latest;
  void id;
  return ruleset;
}

const DiscardDraftInputSchema = z.object({
  idempotencyKey: IdempotencyKey,
  screeningId: z.string().trim().min(1),
});

function sourceOf(ctx: TxContext): Screening["source"] {
  return ctx.engine.appId === "worker" ? "worker_mobile" : "clinical_web";
}

export function createScreeningService(engine: Engine) {
  async function loadPatientFor(ctx: TxContext, patientId: string): Promise<Patient> {
    const patient = await ctx.find<Patient>("patient", patientId);
    if (!patient) {
      throw new RepositoryError("VALIDATION_ERROR", {
        fieldErrors: { patientId: { key: "invalid", params: {} } },
        details: { entityType: "patient", entityId: patientId },
      });
    }
    return patient;
  }

  return {
    listScreenings(f?: ScreeningFilterInput): Promise<Page<Screening>> {
      return engine.read(async (ctx) => {
        const filter = parseFilter(ScreeningFilterSchema, f);
        const permission = readPermission(ctx, READ_PERMISSIONS.screening, {
          entityType: "screening",
          entityId: "list",
        });
        assertRequestedScope(ctx, permission, filter);
        const wantsDrafts = filter.statuses?.includes("draft") ?? false;
        const rows = (await ctx.all<Screening>("screening")).filter(
          (s) =>
            ctx.can(permission, screeningResource(s)) &&
            // Drafts are device-local: only the author's own drafts, only when asked for.
            (s.status !== "draft" || (wantsDrafts && s.workerId === ctx.actorId)) &&
            (!filter.patientId || s.patientId === filter.patientId) &&
            (!filter.statuses || filter.statuses.includes(s.status)) &&
            (!filter.facilityIds || (filter.facilityIds as string[]).includes(s.facilityId)) &&
            (!filter.districtIds || (filter.districtIds as string[]).includes(s.districtId)) &&
            (!filter.from || s.measuredAt >= filter.from) &&
            (!filter.to || s.measuredAt <= filter.to),
        );
        return paginate(
          sortBy(rows, (s) => s.measuredAt, "desc"),
          filter.page,
          filter.pageSize,
        );
      });
    },

    getScreening(id: string): Promise<Screening | null> {
      return engine.read(async (ctx) => {
        const permission = readPermission(ctx, READ_PERMISSIONS.screening, {
          entityType: "screening",
          entityId: id,
        });
        const screening = await ctx.find<Screening>("screening", id);
        if (!screening) return null;
        ctx.authorize(permission, screeningResource(screening), {
          entityType: "screening",
          entityId: id,
        });
        if (screening.status === "draft" && screening.workerId !== ctx.actorId) return null;
        return screening;
      });
    },

    saveScreeningDraft(i: ScreeningDraftCall, key: string): Promise<WriteResult<Screening>> {
      return engine.mutate({
        op: "saveScreeningDraft",
        key,
        input: i,
        entityType: "screening",
        permission: "screening.create",
        schema: ScreeningDraftInputSchema,
        run: async (ctx, input) => {
          const actor = ctx.requireActor();
          const patient = await loadPatientFor(ctx, input.patientId);
          const resource = {
            facilityId: patient.facilityId,
            districtId: patient.districtId,
            patientId: patient.id,
          };
          ctx.authorize("screening.create", resource, {
            entityType: "screening",
            entityId: input.screeningId ?? "new",
          });
          const patch: ScreeningDraftPatch = {};
          if (input.measuredAt !== undefined) patch.measuredAt = input.measuredAt;
          if (input.systolic !== undefined) patch.systolic = input.systolic;
          if (input.diastolic !== undefined) patch.diastolic = input.diastolic;
          if (input.glucoseValue !== undefined) patch.glucoseValue = input.glucoseValue;
          if (input.glucoseUnit !== undefined) patch.glucoseUnit = input.glucoseUnit;
          if (input.glucoseContext !== undefined) patch.glucoseContext = input.glucoseContext;
          if (input.notes !== undefined) patch.notes = input.notes;
          if (input.captureDurationSeconds !== undefined) {
            patch.captureDurationSeconds = input.captureDurationSeconds;
          }

          let before: Screening | null = null;
          let draft: Screening;
          if (input.screeningId) {
            before = await ctx.load<Screening>("screening", input.screeningId);
            if (before.patientId !== patient.id || before.workerId !== actor.personaId) {
              throw new RepositoryError("FORBIDDEN", { reason: "SCOPE" });
            }
            draft = updateScreeningDraft(before, patch, ctx.nowIso);
          } else {
            draft = {
              id: asId<ScreeningId>(ctx.ids()),
              patientId: patient.id,
              workerId: actor.personaId,
              facilityId: patient.facilityId,
              districtId: patient.districtId,
              measuredAt: ctx.nowIso,
              systolic: null,
              diastolic: null,
              glucoseValue: null,
              glucoseUnit: null,
              glucoseContext: null,
              observations: [],
              source: sourceOf(ctx),
              rulesetVersion: null,
              status: "draft",
              flag: null,
              clientMutationId: input.idempotencyKey,
              captureDurationSeconds: null,
              notes: "",
              amendments: [],
              ...ctx.created(),
              ...patch,
            };
          }
          await ctx.save("screening", draft);
          ctx.useCorrelation(before ? await ctx.correlationOf(before.id) : null);
          const event = await ctx.audit({
            action: "screening.draft_saved",
            entityType: "screening",
            entityId: draft.id,
            before,
            after: draft,
          });
          // Device-local: never enqueued for sync.
          return { data: draft, entityType: "screening", auditEventId: event.id, sync: null };
        },
      });
    },

    discardScreeningDraft(id: string, key: string): Promise<WriteResult<Screening>> {
      return engine.mutate({
        op: "discardScreeningDraft",
        key,
        input: { screeningId: id },
        entityType: "screening",
        permission: "screening.create",
        schema: DiscardDraftInputSchema,
        run: async (ctx, input) => {
          const draft = await ctx.load<Screening>("screening", input.screeningId);
          ctx.authorize("screening.create", screeningResource(draft), {
            entityType: "screening",
            entityId: draft.id,
          });
          assertScreeningMutable(draft);
          if (draft.workerId !== ctx.actorId) {
            throw new RepositoryError("FORBIDDEN", { reason: "SCOPE" });
          }
          await ctx.tx.delete("screenings", draft.id);
          const discarded = ctx.touch(draft);
          ctx.useCorrelation(await ctx.correlationOf(draft.id));
          const event = await ctx.audit({
            action: "screening.draft_discarded",
            entityType: "screening",
            entityId: draft.id,
            before: draft,
          });
          return { data: discarded, entityType: "screening", auditEventId: event.id, sync: null };
        },
      });
    },

    createScreening(
      i: ScreeningCall,
      key: string,
      options: { presetId?: string } = {},
    ): Promise<WriteResult<Screening>> {
      return engine.mutate({
        op: "createScreening",
        key,
        input: i,
        entityType: "screening",
        permission: "screening.create",
        schema: async (ctx) => {
          const ruleset = await activeRuleset(ctx);
          return createScreeningInputSchema({ limits: ruleset.plausibility, now: () => ctx.now });
        },
        run: async (ctx, input) => {
          const actor = ctx.requireActor();
          const ruleset = await activeRuleset(ctx);
          const patient = await loadPatientFor(ctx, input.patientId);
          ctx.authorize(
            "screening.create",
            {
              facilityId: patient.facilityId,
              districtId: patient.districtId,
              patientId: patient.id,
            },
            { entityType: "screening", entityId: options.presetId ?? "new" },
          );
          const id = asId<ScreeningId>(options.presetId ?? ctx.ids());
          if (await ctx.find<Screening>("screening", id)) {
            throw new RepositoryError("CONFLICT", { details: { entityId: id, exists: true } });
          }
          const inputs = {
            systolic: input.systolic,
            diastolic: input.diastolic,
            glucoseValue: input.glucoseValue,
            glucoseUnit: input.glucoseUnit,
            glucoseContext: input.glucoseContext,
          };
          const flag = evaluateScreening(inputs, ruleset);
          const screening: Screening = {
            id,
            patientId: patient.id,
            workerId: actor.personaId,
            facilityId: patient.facilityId,
            districtId: patient.districtId,
            measuredAt: input.measuredAt,
            ...inputs,
            observations: [],
            source: sourceOf(ctx),
            rulesetVersion: ruleset.version,
            status: flag.requiresReview ? "review_required" : "no_review_required",
            flag,
            clientMutationId: input.idempotencyKey,
            captureDurationSeconds: input.captureDurationSeconds ?? null,
            notes: input.notes,
            amendments: [],
            ...ctx.created(),
          };
          await ctx.save("screening", screening);
          ctx.useCorrelation(null);
          const event = await ctx.audit({
            action: "screening.submitted",
            entityType: "screening",
            entityId: id,
            after: screening,
            changeSummary: {
              status: screening.status,
              requiresReview: flag.requiresReview,
              evaluable: flag.evaluable,
              reasonCodes: flag.reasonCodes,
              rulesetVersion: ruleset.version,
            },
          });
          if (flag.requiresReview) {
            const review: Review = {
              id: asId<ReviewId>(ctx.ids()),
              screeningId: id,
              patientId: patient.id,
              facilityId: patient.facilityId,
              assignedClinicianId: null,
              status: "pending",
              flagReasons: flag.reasonCodes,
              evidenceSnapshot: {
                flag,
                inputs,
                capturedAt: ctx.nowIso,
                capturedBy: actor.personaId,
              },
              decision: null,
              decisionReason: null,
              reviewedAt: null,
              startedBy: null,
              reviewedBy: null,
              priority: "routine",
              reviewDueAt: null,
              origin: "rule_flag",
              ...ctx.created(),
            };
            await ctx.save("review", review);
            await ctx.audit({
              action: "review.created",
              entityType: "review",
              entityId: review.id,
              after: review,
              changeSummary: { screeningId: id, reasonCodes: flag.reasonCodes },
            });
          }
          return {
            data: screening,
            entityType: "screening",
            auditEventId: event.id,
            sync: { entityType: "screening", entityId: id, opType: "create" },
          };
        },
      });
    },

    amendScreening(i: ScreeningAmendmentCall, key: string): Promise<WriteResult<Screening>> {
      return engine.mutate({
        op: "amendScreening",
        key,
        input: i,
        entityType: "screening",
        permission: "screening.amend",
        schema: async (ctx) => {
          const ruleset = await activeRuleset(ctx);
          return createScreeningAmendmentInputSchema({
            limits: ruleset.plausibility,
            now: () => ctx.now,
          });
        },
        run: async (ctx, input) => {
          const actor = ctx.requireActor();
          const screening = await ctx.load<Screening>("screening", input.screeningId);
          const resource = screeningResource(screening);
          ctx.authorize("screening.amend", resource, {
            entityType: "screening",
            entityId: screening.id,
          });
          await ctx.assertVersion("screening", screening, input.expectedVersion, resource);
          const amended = applyAmendment(screening, {
            id: asId<ScreeningAmendmentId>(ctx.ids()),
            field: input.field,
            after: input.after,
            reason: input.reason,
            amendedBy: actor.personaId,
            amendedAt: ctx.nowIso,
          });
          await ctx.save("screening", amended);
          const record = amended.amendments[amended.amendments.length - 1];
          ctx.useCorrelation(await ctx.correlationOf(screening.id));
          const event = await ctx.audit({
            action: "screening.amended",
            entityType: "screening",
            entityId: screening.id,
            before: screening,
            after: amended,
            changeSummary: {
              field: input.field,
              before: record?.before ?? null,
              after: input.after,
            },
            justification: input.reason,
          });
          return {
            data: amended,
            entityType: "screening",
            auditEventId: event.id,
            sync: { entityType: "screening", entityId: screening.id, opType: "update" },
          };
        },
      });
    },
  };
}
