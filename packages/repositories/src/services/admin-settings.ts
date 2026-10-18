/**
 * Programme Admin settings (ADM-09): the demo-configurable small-cell suppression threshold.
 *
 * Storage: store meta `admin.settings` (JSON `AdminSettings`) — no extra collection / Dexie
 * version. An absent key IS the seed baseline (k = `DEMO_SMALL_CELL_THRESHOLD`, version 1,
 * `updatedBy` null, `updatedAt` = the demo clock default), so `resetDemo()` (`clearAll` wipes
 * meta) restores it exactly.
 *
 * - `getAdminSettings()` — any signed-in admin role (`metrics.read`): every dashboard applies it.
 * - `updateAdminSettings(input, key)` — `settings.privacy` only; a denial is audited as
 *   `admin.settings.denied` (outcome `denied`). Idempotent on `key`; `expectedVersion` stale (or a
 *   demo `conflictOnce` on `audit_event`/`admin-settings`) → `CONFLICT` with `latest` +
 *   `conflict.detected`. The threshold never goes below the governance floor
 *   (`ADMIN_THRESHOLD_MIN`, schema). Audited `admin.settings.suppression_threshold_changed`
 *   (before / after, justification, version n → n+1).
 *
 * Audit entity: `audit_event` / `admin-settings` — the entity type the repository already uses for
 * system configuration events (`demo.fault_toggled` → `faults`, `demo.clock_changed` → `clock`).
 */
import {
  ADMIN_SETTINGS_ID,
  AdminSettingsSchema,
  AdminSettingsUpdateInputSchema,
  type AdminSettings,
  type WriteResult,
} from "@laif/contracts";
import { asId, DEMO_CLOCK_DEFAULT_ISO, type CorrelationId } from "@laif/domain";
import { DEMO_SMALL_CELL_THRESHOLD } from "@laif/mock-data";

import type { MutationInput } from "../care-repository.ts";
import type { Engine, TxContext } from "../core/engine.ts";

export const ADMIN_SETTINGS_META_KEY = "admin.settings" as const;
const ENTITY = "audit_event" as const;

export type AdminSettingsUpdateCall = MutationInput<typeof AdminSettingsUpdateInputSchema>;

/** The seed baseline (k = 5). */
export function baselineAdminSettings(): AdminSettings {
  return {
    id: ADMIN_SETTINGS_ID,
    suppressionThreshold: DEMO_SMALL_CELL_THRESHOLD,
    updatedBy: null,
    updatedAt: DEMO_CLOCK_DEFAULT_ISO,
    version: 1,
  };
}

async function readSettings(ctx: TxContext): Promise<AdminSettings> {
  const raw = await ctx.tx.getMeta(ADMIN_SETTINGS_META_KEY);
  if (raw === undefined || raw === "") return baselineAdminSettings();
  const parsed = AdminSettingsSchema.safeParse(JSON.parse(raw));
  return parsed.success ? parsed.data : baselineAdminSettings();
}

export function createAdminSettingsService(engine: Engine) {
  return {
    getAdminSettings(): Promise<AdminSettings> {
      return engine.read(async (ctx) => {
        ctx.authorize("metrics.read", undefined, {
          entityType: ENTITY,
          entityId: ADMIN_SETTINGS_ID,
        });
        return readSettings(ctx);
      });
    },

    updateAdminSettings(
      i: AdminSettingsUpdateCall,
      key: string,
    ): Promise<WriteResult<AdminSettings>> {
      return engine.mutate({
        op: "updateAdminSettings",
        key,
        input: i,
        entityType: ENTITY,
        // Checked in `schema` (before validation) so the denial carries `admin.settings.denied`.
        permission: null,
        schema: (ctx) => {
          ctx.authorize("settings.privacy", undefined, {
            entityType: ENTITY,
            entityId: ADMIN_SETTINGS_ID,
            denyAction: "admin.settings.denied",
          });
          return Promise.resolve(AdminSettingsUpdateInputSchema);
        },
        run: async (ctx, input) => {
          const actor = ctx.requireActor();
          const current = await readSettings(ctx);
          ctx.useCorrelation(
            input.correlationId === undefined ? null : asId<CorrelationId>(input.correlationId),
          );
          await ctx.assertVersion(ENTITY, current, input.expectedVersion);
          const next: AdminSettings = AdminSettingsSchema.parse({
            ...ctx.touch(current, {
              suppressionThreshold: input.suppressionThreshold,
              updatedBy: actor.personaId,
            }),
          });
          await ctx.tx.setMeta(ADMIN_SETTINGS_META_KEY, JSON.stringify(next));
          const event = await ctx.audit({
            action: "admin.settings.suppression_threshold_changed",
            entityType: ENTITY,
            entityId: ADMIN_SETTINGS_ID,
            facilityId: null,
            districtId: null,
            before: current,
            after: next,
            changeSummary: {
              before: current.suppressionThreshold,
              after: next.suppressionThreshold,
              fromVersion: current.version,
              toVersion: next.version,
            },
            justification: input.justification,
          });
          return { data: next, entityType: ENTITY, auditEventId: event.id, sync: null };
        },
      });
    },
  };
}
