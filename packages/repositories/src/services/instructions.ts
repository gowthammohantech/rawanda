/**
 * Care instructions — the only next steps the citizen wallet may show (CTZ-04). Released by the
 * care team; progress is derived (`deriveInstructionProgress`), never stored.
 */
import { ReleaseCareInstructionInputSchema, type WriteResult } from "@laif/contracts";
import {
  asId,
  type CareInstruction,
  type CareInstructionId,
  type FollowUp,
  type Patient,
  type Referral,
  type Review,
} from "@laif/domain";

import type { ReleaseCareInstructionCall } from "../care-repository.ts";
import type { Engine } from "../core/engine.ts";
import { RepositoryError } from "../errors.ts";
import { authorisePatientRead } from "./reminders.ts";
import { patientResource, READ_PERMISSIONS, sortBy } from "./shared.ts";

export function createInstructionService(engine: Engine) {
  return {
    listCareInstructions(patientId: string): Promise<CareInstruction[]> {
      return engine.read(async (ctx) => {
        await authorisePatientRead(
          ctx,
          patientId,
          READ_PERMISSIONS.instruction,
          "care_instruction",
        );
        const citizen = ctx.actor?.role === "citizen";
        const rows = (await ctx.all<CareInstruction>("care_instruction")).filter(
          (c) => c.patientId === patientId && (!citizen || c.status === "released"),
        );
        return sortBy(rows, (c) => c.releasedAt);
      });
    },

    releaseCareInstruction(
      i: ReleaseCareInstructionCall,
      key: string,
    ): Promise<WriteResult<CareInstruction>> {
      return engine.mutate({
        op: "releaseCareInstruction",
        key,
        input: i,
        entityType: "care_instruction",
        permission: "review.decide",
        schema: ReleaseCareInstructionInputSchema,
        run: async (ctx, input) => {
          const actor = ctx.requireActor();
          const patient = await ctx.load<Patient>("patient", input.patientId);
          ctx.authorize("review.decide", patientResource(patient), {
            entityType: "patient",
            entityId: patient.id,
          });
          const source = await ctx.find<Referral | FollowUp | Review>(
            input.sourceType,
            input.sourceId,
          );
          if (!source || source.patientId !== patient.id) {
            throw new RepositoryError("VALIDATION_ERROR", {
              fieldErrors: { sourceId: { key: "invalid", params: {} } },
            });
          }
          const instruction: CareInstruction = {
            id: asId<CareInstructionId>(ctx.ids()),
            patientId: patient.id,
            kind: input.kind,
            sourceType: input.sourceType,
            sourceId: input.sourceId,
            messageKey: input.messageKey,
            params: input.params,
            appointmentAt: input.appointmentAt,
            facilityId: input.facilityId,
            releasedBy: actor.personaId,
            releasedAt: ctx.nowIso,
            status: "released",
            ...ctx.created(),
          };
          await ctx.save("care_instruction", instruction);
          ctx.useCorrelation(await ctx.correlationOf(input.sourceId));
          const event = await ctx.audit({
            action: "instruction.released",
            entityType: "care_instruction",
            entityId: instruction.id,
            after: instruction,
            facilityId: patient.facilityId,
            changeSummary: { kind: instruction.kind, sourceType: instruction.sourceType },
          });
          return {
            data: instruction,
            entityType: "care_instruction",
            auditEventId: event.id,
            sync: { entityType: "care_instruction", entityId: instruction.id, opType: "create" },
          };
        },
      });
    },
  };
}
