/**
 * Reminders (CTZ-05). Delivery is simulated. Reminders NEVER change a referral or follow-up
 * status (spec §5.2, `assertNotCompletedByReminder`); opting out cancels scheduled reminders.
 */
import { ReminderPreferenceInputSchema, type WriteResult } from "@laif/contracts";
import {
  asId,
  type Patient,
  type Reminder,
  type ReminderPreference,
  type ReminderPreferenceId,
} from "@laif/domain";

import type { ReminderPreferenceCall } from "../care-repository.ts";
import type { Engine, TxContext } from "../core/engine.ts";
import { patientResource, READ_PERMISSIONS, readPermission, sortBy } from "./shared.ts";

/** Loads the patient and checks the read permission for it (audited `FORBIDDEN`). */
export async function authorisePatientRead(
  ctx: TxContext,
  patientId: string,
  candidates: readonly Parameters<typeof readPermission>[1][number][],
  entityType: "reminder" | "care_instruction",
): Promise<Patient> {
  const permission = readPermission(ctx, candidates, { entityType, entityId: patientId });
  const patient = await ctx.load<Patient>("patient", patientId);
  ctx.authorize(permission, patientResource(patient), {
    entityType: "patient",
    entityId: patientId,
  });
  return patient;
}

export function createReminderService(engine: Engine) {
  return {
    listReminders(patientId: string): Promise<Reminder[]> {
      return engine.read(async (ctx) => {
        await authorisePatientRead(ctx, patientId, READ_PERMISSIONS.reminder, "reminder");
        const rows = (await ctx.all<Reminder>("reminder")).filter((r) => r.patientId === patientId);
        return sortBy(rows, (r) => r.scheduledAt);
      });
    },

    setReminderPreference(
      i: ReminderPreferenceCall,
      key: string,
    ): Promise<WriteResult<ReminderPreference>> {
      return engine.mutate({
        op: "setReminderPreference",
        key,
        input: i,
        entityType: "reminder_preference",
        permission: "self.reminders.manage",
        schema: ReminderPreferenceInputSchema,
        run: async (ctx, input) => {
          const patient = await ctx.load<Patient>("patient", input.patientId);
          ctx.authorize("self.reminders.manage", patientResource(patient), {
            entityType: "patient",
            entityId: patient.id,
          });
          const existing = (await ctx.all<ReminderPreference>("reminder_preference")).find(
            (p) => p.patientId === patient.id,
          );
          let next: ReminderPreference;
          if (existing) {
            if (input.expectedVersion !== undefined) {
              await ctx.assertVersion("reminder_preference", existing, input.expectedVersion, {
                patientId: patient.id,
              });
            }
            next = ctx.touch(existing, { optedIn: input.optedIn, timing: input.timing });
          } else {
            next = {
              id: asId<ReminderPreferenceId>(ctx.ids()),
              patientId: patient.id,
              optedIn: input.optedIn,
              timing: input.timing,
              channel: "in_app",
              ...ctx.created(),
            };
          }
          await ctx.save("reminder_preference", next);
          // Opting out cancels scheduled reminders only — never a referral / follow-up.
          if (!input.optedIn) {
            for (const reminder of await ctx.all<Reminder>("reminder")) {
              if (reminder.patientId !== patient.id || reminder.status !== "scheduled") continue;
              await ctx.save(
                "reminder",
                ctx.touch(reminder, { status: "cancelled", cancelReason: "opted_out" }),
              );
            }
          }
          ctx.useCorrelation(existing ? await ctx.correlationOf(existing.id) : null);
          const event = await ctx.audit({
            action: "reminder.preference_changed",
            entityType: "reminder_preference",
            entityId: next.id,
            before: existing ?? null,
            after: next,
            patientId: patient.id,
            facilityId: patient.facilityId,
            changeSummary: { optedIn: next.optedIn, timing: next.timing },
          });
          return {
            data: next,
            entityType: "reminder_preference",
            auditEventId: event.id,
            sync: {
              entityType: "reminder_preference",
              entityId: next.id,
              opType: existing ? "update" : "create",
            },
          };
        },
      });
    },
  };
}
