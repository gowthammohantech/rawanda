import { asId, type DeviceSession } from "@laif/domain";
import { DEMO_PERSONAS, PERSONA_IDS } from "@laif/mock-data";
import { describe, expect, it, vi } from "vitest";

import { isDeviceSessionActive, revokeDeviceSession } from "./device.ts";
import {
  createMemoryStorage,
  createPersonaSession,
  personaStorageKey,
  ROLE_SWITCH_DISCLAIMER_EN,
  ROLE_SWITCH_DISCLAIMER_KEY,
} from "./session.ts";

describe("createPersonaSession", () => {
  it("persists the selected persona under laif.<appId>.persona and survives a new store", () => {
    const storage = createMemoryStorage();
    const session = createPersonaSession({ storage, appId: "clinical", personas: DEMO_PERSONAS });
    expect(session.current()).toBeNull();
    const result = session.switchTo(PERSONA_IDS.clinAlpha1);
    expect(result).toMatchObject({ ok: true, persona: { id: PERSONA_IDS.clinAlpha1 } });
    expect(storage.entries()).toEqual({ "laif.clinical.persona": PERSONA_IDS.clinAlpha1 });
    const reloaded = createPersonaSession({ storage, appId: "clinical", personas: DEMO_PERSONAS });
    expect(reloaded.current()?.id).toBe(PERSONA_IDS.clinAlpha1);
  });

  it("only allows personas whose appIds include the app", () => {
    const session = createPersonaSession({
      storage: createMemoryStorage(),
      appId: "worker",
      personas: DEMO_PERSONAS,
    });
    expect(session.switchTo(PERSONA_IDS.clinAlpha1)).toEqual({
      ok: false,
      reason: "APP_NOT_ALLOWED",
    });
    expect(session.switchTo("persona-nobody")).toEqual({ ok: false, reason: "UNKNOWN_PERSONA" });
    expect(session.current()).toBeNull();
    expect(session.available().map((p) => p.role)).toEqual([
      "community_health_worker",
      "community_health_worker",
      "community_health_worker",
      "community_health_worker",
      "field_supervisor",
    ]);
  });

  it("keeps sessions per app and clears stale stored ids", () => {
    const storage = createMemoryStorage({ [personaStorageKey("admin")]: PERSONA_IDS.clinAlpha1 });
    const admin = createPersonaSession({ storage, appId: "admin", personas: DEMO_PERSONAS });
    expect(admin.current()).toBeNull();
    expect(storage.entries()).toEqual({});
    const citizen = createPersonaSession({ storage, appId: "citizen", personas: DEMO_PERSONAS });
    citizen.switchTo(PERSONA_IDS.citizenRep);
    admin.switchTo(PERSONA_IDS.analystAlpha);
    expect(storage.entries()).toEqual({
      "laif.citizen.persona": PERSONA_IDS.citizenRep,
      "laif.admin.persona": PERSONA_IDS.analystAlpha,
    });
  });

  it("notifies subscribers on switch and sign-out; unsubscribe stops notifications", () => {
    const session = createPersonaSession({
      storage: createMemoryStorage(),
      appId: "admin",
      personas: DEMO_PERSONAS,
    });
    const listener = vi.fn();
    const off = session.subscribe(listener);
    session.switchTo(PERSONA_IDS.leadProgramme);
    session.signOut();
    expect(listener.mock.calls.map(([p]) => (p as { id: string } | null)?.id ?? null)).toEqual([
      PERSONA_IDS.leadProgramme,
      null,
    ]);
    expect(session.current()).toBeNull();
    off();
    session.switchTo(PERSONA_IDS.auditorProgramme);
    expect(listener).toHaveBeenCalledTimes(2);
  });

  it("is labelled as a demo role switch, not authentication", () => {
    const session = createPersonaSession({
      storage: createMemoryStorage(),
      appId: "clinical",
      personas: DEMO_PERSONAS,
    });
    expect(session.disclaimerKey).toBe(ROLE_SWITCH_DISCLAIMER_KEY);
    expect(ROLE_SWITCH_DISCLAIMER_EN).toBe("Demo role switch — not authentication");
  });
});

describe("revokeDeviceSession", () => {
  const session: DeviceSession = {
    id: asId("ds-1"),
    personaId: PERSONA_IDS.chwAlpha1A,
    deviceId: asId("dev-1"),
    facilityId: asId("fac-alpha-1"),
    status: "active",
    version: 1,
    createdAt: "2026-10-14T06:00:00.000Z",
    updatedAt: "2026-10-14T06:00:00.000Z",
    synthetic: true,
  };
  const now = new Date("2026-10-14T07:00:00.000Z");

  it("revokes with a version bump and is idempotent", () => {
    const revoked = revokeDeviceSession(session, { now });
    expect(revoked).toEqual({
      ...session,
      status: "revoked",
      version: 2,
      updatedAt: now.toISOString(),
    });
    expect(session.status).toBe("active");
    expect(revokeDeviceSession(revoked, { now: new Date("2026-10-15T00:00:00.000Z") })).toBe(
      revoked,
    );
    expect(isDeviceSessionActive(session)).toBe(true);
    expect(isDeviceSessionActive(revoked)).toBe(false);
    expect(isDeviceSessionActive(null)).toBe(false);
  });
});
