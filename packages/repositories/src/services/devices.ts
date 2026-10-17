/**
 * Device identity + device sessions (HWM-01, FRD HW-01). Demo sign-in only — NOT authentication.
 *
 * - `getOrCreateDeviceId()`: stable per-install id in store meta `device_id` (platform UUID from
 *   the injected id generator — `expo-crypto` `randomUUID` on device). Only `resetDemo()`
 *   (`clearAll`) removes it.
 * - `startSession()`: checks the persona may use this app and that the facility is inside the
 *   persona's scope (`checkAccess`, permission `patient.read`). A denial writes `access.denied`
 *   (attributed to the attempted persona, after the rollback) and throws `FORBIDDEN`
 *   (`ROLE` / `SCOPE`). Success ends any other active session of the device, writes the
 *   `deviceSessions` record (and the simulated remote's copy in the worker app) and
 *   `session.started` in one transaction.
 * - `endSession()`: marks the record `ended` + `session.ended`; nothing else is touched
 *   (unsynced work stays on the device). A revoked session stays revoked.
 */
import { actorForPersona, checkAccess } from "@laif/auth-demo";
import {
  contractsErrorMap,
  FacilityIdSchema,
  issuesToFieldErrors,
  NonEmptyTrimmed,
  PersonaIdSchema,
} from "@laif/contracts";
import {
  asId,
  type DemoPersona,
  type DeviceId,
  type DeviceSession,
  type DeviceSessionId,
} from "@laif/domain";
import { z } from "zod";

import type { DeviceApi, StartDeviceSessionCall } from "../care-repository.ts";
import { defer, type Engine, type TxContext } from "../core/engine.ts";
import { RepositoryError } from "../errors.ts";

export const DEVICE_ID_META_KEY = "device_id" as const;

/** The scope check of a device sign-in: may the persona work with this facility's patients? */
export const DEVICE_SIGN_IN_PERMISSION = "patient.read" as const;

const StartSchema = z.object({
  personaId: PersonaIdSchema,
  facilityId: FacilityIdSchema,
  deviceId: NonEmptyTrimmed,
});

export function createDeviceService(engine: Engine, options: { remote: boolean }): DeviceApi {
  const put = async (ctx: TxContext, session: DeviceSession) => {
    await ctx.tx.put("deviceSessions", session);
    if (options.remote) await ctx.tx.put("remote_deviceSessions", session);
  };

  const end = async (ctx: TxContext, session: DeviceSession): Promise<DeviceSession> => {
    const next: DeviceSession = {
      ...session,
      status: "ended",
      version: session.version + 1,
      updatedAt: ctx.nowIso,
    };
    await put(ctx, next);
    const persona = await ctx.tx.get<DemoPersona>("personas", session.personaId);
    await ctx.audit({
      action: "session.ended",
      entityType: "device_session",
      entityId: session.id,
      before: session,
      after: next,
      facilityId: session.facilityId,
      changeSummary: { deviceId: session.deviceId, personaId: session.personaId },
      actor: { actorId: session.personaId, actorRole: persona?.role ?? null },
    });
    return next;
  };

  return {
    getOrCreateDeviceId() {
      return engine.write(async (ctx) => {
        const existing = await ctx.tx.getMeta(DEVICE_ID_META_KEY);
        if (existing !== undefined && existing !== "") return existing;
        const id = ctx.ids();
        await ctx.tx.setMeta(DEVICE_ID_META_KEY, id);
        return id;
      });
    },

    getSession(id: string) {
      return engine.read(
        async (ctx) => (await ctx.tx.get<DeviceSession>("deviceSessions", id)) ?? null,
      );
    },

    startSession(i: StartDeviceSessionCall) {
      return engine.write(async (ctx) => {
        const parsed = StartSchema.safeParse(i, { error: contractsErrorMap });
        if (!parsed.success) {
          throw new RepositoryError("VALIDATION_ERROR", {
            fieldErrors: issuesToFieldErrors(parsed.error.issues),
          });
        }
        const { personaId, facilityId, deviceId } = parsed.data;
        const persona = await ctx.tx.get<DemoPersona>("personas", personaId);
        const appAllowed = persona?.appIds.includes(engine.appId) === true;
        const decision =
          persona && appAllowed
            ? checkAccess(
                actorForPersona(persona),
                DEVICE_SIGN_IN_PERMISSION,
                { facilityId },
                { facilityToDistrict: ctx.facilityToDistrict },
              )
            : ({ allowed: false, reason: "ROLE" } as const);
        if (!decision.allowed) {
          const error = new RepositoryError("FORBIDDEN", {
            reason: decision.reason,
            details: { personaId, facilityId },
          });
          throw defer(error, {
            action: "access.denied",
            entityType: "facility",
            entityId: facilityId,
            outcome: "denied",
            ...ctx.scopeOf({ facilityId }),
            changeSummary: {
              permission: DEVICE_SIGN_IN_PERMISSION,
              reason: decision.reason,
              attempt: "device_sign_in",
              deviceId,
            },
            actorId: persona ? persona.id : null,
            actorRole: persona ? persona.role : null,
            occurredAt: ctx.nowIso,
          });
        }

        const open = (await ctx.tx.getAll<DeviceSession>("deviceSessions")).filter(
          (s) => s.deviceId === deviceId && s.status === "active",
        );
        for (const previous of open) await end(ctx, previous);

        const session: DeviceSession = {
          id: asId<DeviceSessionId>(ctx.ids()),
          personaId,
          deviceId: asId<DeviceId>(deviceId),
          facilityId,
          status: "active",
          version: 1,
          createdAt: ctx.nowIso,
          updatedAt: ctx.nowIso,
          synthetic: true,
        };
        await put(ctx, session);
        await ctx.audit({
          action: "session.started",
          entityType: "device_session",
          entityId: session.id,
          after: session,
          facilityId,
          changeSummary: { deviceId, personaId, demoSignIn: true },
          actor: { actorId: personaId, actorRole: persona!.role },
        });
        return session;
      });
    },

    endSession(id: string) {
      return engine.write(async (ctx) => {
        const session = await ctx.tx.get<DeviceSession>("deviceSessions", id);
        if (!session) return null;
        if (session.status !== "active") return session;
        return end(ctx, session);
      });
    },
  };
}
