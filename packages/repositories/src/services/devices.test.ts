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

describe("device activity log (HWM-10)", () => {
  const worker = () => createHarness({ appId: "worker", personaId: PERSONA_IDS.chwAlpha1A });
  const screening = (h: Awaited<ReturnType<typeof createHarness>>) => ({
    patientId: h.seed.patients.find((p) => p.facilityId === FACILITY_IDS.alpha1)!.id,
    measuredAt: "2026-10-14T05:10:00.000Z",
    systolic: 126,
    diastolic: 80,
    notes: "Private free-text note about the visit",
  });

  it("after a reset only the baseline demo.reset is listed (seed history excluded)", async () => {
    const h = await worker();
    await h.repo.demo.resetDemo();
    const rows = await h.repo.device.listActivity();
    expect(rows.map((r) => [r.action, r.source])).toEqual([["demo.reset", "device"]]);
  });

  it("lists device + server-mirrored events newest first, metadata only (no notes)", async () => {
    const h = await worker();
    await h.repo.demo.resetDemo();
    h.clock.advanceBy(60_000);
    await h.repo.createScreening(screening(h), h.key());
    h.clock.advanceBy(60_000);
    await h.repo.sync.process({ trigger: "manual" });
    const rows = await h.repo.device.listActivity();
    const actions = rows.map((r) => r.action);
    expect(actions).toContain("screening.submitted");
    expect(actions).toContain("sync.op_acknowledged");
    expect(rows.some((r) => r.source === "server")).toBe(true);
    expect(actions.at(-1)).toBe("demo.reset");
    const times = rows.map((r) => r.occurredAt);
    expect([...times].sort().reverse()).toEqual(times);
    const json = JSON.stringify(rows);
    expect(json).not.toContain("Private free-text note");
    for (const row of rows) {
      expect(Object.keys(row).sort()).toEqual(
        [
          "action",
          "actorId",
          "actorRole",
          "category",
          "correlationId",
          "entityId",
          "entityType",
          "id",
          "occurredAt",
          "outcome",
          "source",
        ].sort(),
      );
    }
  });

  it("signed out or revoked → FORBIDDEN", async () => {
    const h = await worker();
    await h.attachDevice();
    await h.repo.sync.revokeDevice();
    await expect(h.repo.device.listActivity()).rejects.toMatchObject({
      code: "FORBIDDEN",
      reason: "SESSION_REVOKED",
    });
    h.as(null);
    await expect(h.repo.device.listActivity()).rejects.toMatchObject({ code: "FORBIDDEN" });
  });
});
