import type { AuditEvent, DeviceSession } from "@laif/domain";
import { FACILITY_IDS, PERSONA_IDS } from "@laif/mock-data";
import { describe, expect, it } from "vitest";

import { createHarness } from "../testing/harness.ts";
import { DEVICE_ID_META_KEY } from "./devices.ts";

const audits = async (h: Awaited<ReturnType<typeof createHarness>>, action: string) =>
  (await h.store.getAll<AuditEvent>("auditEvents")).filter((e) => e.action === action);

describe("device service (HWM-01)", () => {
  it("device id is created once, persisted in meta and stable across restarts", async () => {
    const h = await createHarness({ appId: "worker" });
    const first = await h.repo.device.getOrCreateDeviceId();
    expect(await h.store.getMeta(DEVICE_ID_META_KEY)).toBe(first);
    expect(await h.repo.device.getOrCreateDeviceId()).toBe(first);
    expect(await h.restart().repo.device.getOrCreateDeviceId()).toBe(first);
  });

  it("reset demo clears the device id (the only way it is regenerated)", async () => {
    const h = await createHarness({ appId: "worker" });
    await h.repo.device.getOrCreateDeviceId();
    await h.repo.demo.resetDemo();
    expect(await h.store.getMeta(DEVICE_ID_META_KEY)).toBeUndefined();
  });

  it("startSession writes the record locally and on the simulated remote and audits session.started", async () => {
    const h = await createHarness({ appId: "worker" });
    const deviceId = await h.repo.device.getOrCreateDeviceId();
    const session = await h.repo.device.startSession({
      personaId: PERSONA_IDS.chwAlpha1A,
      facilityId: FACILITY_IDS.alpha1,
      deviceId,
    });
    expect(session).toMatchObject({ status: "active", deviceId, facilityId: FACILITY_IDS.alpha1 });
    expect(await h.store.get("deviceSessions", session.id)).toEqual(session);
    expect(await h.store.get("remote_deviceSessions", session.id)).toEqual(session);
    const [started] = await audits(h, "session.started");
    expect(started).toMatchObject({
      actorId: PERSONA_IDS.chwAlpha1A,
      actorRole: "community_health_worker",
      entityType: "device_session",
      entityId: session.id,
      facilityId: FACILITY_IDS.alpha1,
      outcome: "success",
    });
    expect(started?.changeSummary).toMatchObject({ deviceId });
    expect(started?.occurredAt).toMatch(/Z$/u);
  });

  it("a facility outside the persona's assignment → FORBIDDEN SCOPE + attributed access.denied, nothing written", async () => {
    const h = await createHarness({ appId: "worker" });
    const deviceId = await h.repo.device.getOrCreateDeviceId();
    await expect(
      h.repo.device.startSession({
        personaId: PERSONA_IDS.chwAlpha1A,
        facilityId: FACILITY_IDS.beta1,
        deviceId,
      }),
    ).rejects.toMatchObject({ code: "FORBIDDEN", reason: "SCOPE" });
    expect(await h.store.getAll("deviceSessions")).toHaveLength(0);
    const denied = (await audits(h, "access.denied")).filter(
      (e) => e.entityId === FACILITY_IDS.beta1,
    );
    expect(denied).toHaveLength(1);
    expect(denied[0]).toMatchObject({
      actorId: PERSONA_IDS.chwAlpha1A,
      outcome: "denied",
      facilityId: FACILITY_IDS.beta1,
    });
    expect(denied[0]?.changeSummary).toMatchObject({ reason: "SCOPE", deviceId });
  });

  it("personas of other apps are refused with ROLE", async () => {
    const h = await createHarness({ appId: "worker" });
    await expect(
      h.repo.device.startSession({
        personaId: PERSONA_IDS.clinAlpha1,
        facilityId: FACILITY_IDS.alpha1,
        deviceId: "dev-1",
      }),
    ).rejects.toMatchObject({ code: "FORBIDDEN", reason: "ROLE" });
  });

  it("supervisors may start a session in either assigned facility", async () => {
    const h = await createHarness({ appId: "worker" });
    const s = await h.repo.device.startSession({
      personaId: PERSONA_IDS.supAlpha,
      facilityId: FACILITY_IDS.alpha2,
      deviceId: "dev-1",
    });
    expect(s.facilityId).toBe(FACILITY_IDS.alpha2);
  });

  it("endSession marks only the device session ended and audits session.ended; a new sign-in ends the previous one", async () => {
    const h = await createHarness({ appId: "worker" });
    const before = await h.store.getAll("patients");
    const a = await h.repo.device.startSession({
      personaId: PERSONA_IDS.chwAlpha1A,
      facilityId: FACILITY_IDS.alpha1,
      deviceId: "dev-1",
    });
    const b = await h.repo.device.startSession({
      personaId: PERSONA_IDS.chwAlpha1B,
      facilityId: FACILITY_IDS.alpha1,
      deviceId: "dev-1",
    });
    expect((await h.repo.device.getSession(a.id))?.status).toBe("ended");
    const ended = await h.repo.device.endSession(b.id);
    expect(ended).toMatchObject({ status: "ended", version: 2 });
    expect((await h.store.get<DeviceSession>("remote_deviceSessions", b.id))?.status).toBe("ended");
    expect(await h.store.getAll("patients")).toEqual(before);
    const endedAudits = await audits(h, "session.ended");
    expect(endedAudits.map((e) => e.actorId)).toEqual([
      PERSONA_IDS.chwAlpha1A,
      PERSONA_IDS.chwAlpha1B,
    ]);
    // Idempotent / unknown.
    expect((await h.repo.device.endSession(b.id))?.version).toBe(2);
    expect(await h.repo.device.endSession("missing")).toBeNull();
  });
});
