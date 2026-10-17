import { createMemoryStorage } from "@laif/auth-demo";
import type { AuditEvent, DeviceSession } from "@laif/domain";
import { FACILITY_IDS, PERSONA_IDS } from "@laif/mock-data";
import { createMemoryStoreAdapter, LOCAL_COLLECTIONS, type StoreAdapter } from "@laif/repositories";
import { describe, expect, it } from "vitest";

import { createAppRepository } from "../../data/repository.ts";
import { createSessionRepo } from "../sessionRepo.ts";
import { createSessionStore, DEVICE_SESSION_STORAGE_KEY } from "../store.ts";

async function setup(store: StoreAdapter = createMemoryStoreAdapter()) {
  const storage = createMemoryStorage();
  const sessionStore = createSessionStore(storage);
  const repo = createAppRepository({ session: sessionStore, store, noLatency: true });
  await repo.demo.ensureSeeded();
  return {
    store,
    storage,
    sessionStore,
    repo,
    sessions: createSessionRepo({ repo, store: sessionStore }),
  };
}

const auditsOf = async (store: StoreAdapter, action: string) =>
  (await store.getAll<AuditEvent>("auditEvents")).filter((e) => e.action === action);

describe("sessionRepo (HWM-01)", () => {
  it("restore with nothing stored → signed_out (no default persona)", async () => {
    const { sessions, sessionStore } = await setup();
    expect(await sessions.restore()).toBe("signed_out");
    expect(sessionStore.current()).toBeNull();
    expect(sessionStore.actor()).toBeNull();
  });

  it("sign-in success: device session + session.started, actor scoped to the facility", async () => {
    const { sessions, sessionStore, store, storage } = await setup();
    const result = await sessions.signIn(PERSONA_IDS.chwAlpha1A, FACILITY_IDS.alpha1);
    expect(result.ok).toBe(true);
    const current = sessionStore.current()!;
    expect(current.persona.id).toBe(PERSONA_IDS.chwAlpha1A);
    expect(current.facilityId).toBe(FACILITY_IDS.alpha1);
    const record = await store.get<DeviceSession>("deviceSessions", current.deviceSessionId);
    expect(record).toMatchObject({ status: "active", deviceId: current.deviceId });
    const [started] = await auditsOf(store, "session.started");
    expect(started).toMatchObject({
      actorId: PERSONA_IDS.chwAlpha1A,
      actorRole: "community_health_worker",
      facilityId: FACILITY_IDS.alpha1,
    });
    expect(started?.changeSummary).toMatchObject({ deviceId: current.deviceId });
    expect(started?.correlationId).toBeTruthy();
    expect(sessionStore.actor()).toMatchObject({
      personaId: PERSONA_IDS.chwAlpha1A,
      scope: { kind: "facility", facilityIds: [FACILITY_IDS.alpha1] },
      deviceSessionId: current.deviceSessionId,
    });
    expect(storage.entries()["laif.worker.persona"]).toBe(PERSONA_IDS.chwAlpha1A);
    expect(await sessions.restore()).toBe("signed_in");
  });

  it("supervisor scope is narrowed to the facility picked at sign-in", async () => {
    const { sessions, sessionStore } = await setup();
    expect((await sessions.signIn(PERSONA_IDS.supAlpha, FACILITY_IDS.alpha2)).ok).toBe(true);
    expect(sessionStore.actor()?.scope).toEqual({
      kind: "facility",
      facilityIds: [FACILITY_IDS.alpha2],
    });
  });

  it("scope denied: FORBIDDEN / SCOPE, access.denied audited, no session", async () => {
    const { sessions, sessionStore, store, storage } = await setup();
    const result = await sessions.signIn(PERSONA_IDS.chwAlpha1A, FACILITY_IDS.beta1);
    expect(result).toEqual({ ok: false, code: "FORBIDDEN", reason: "SCOPE" });
    expect(sessionStore.current()).toBeNull();
    expect(storage.entries()[DEVICE_SESSION_STORAGE_KEY]).toBeUndefined();
    expect(await store.getAll("deviceSessions")).toHaveLength(0);
    const denied = (await auditsOf(store, "access.denied")).filter(
      (e) => e.entityId === FACILITY_IDS.beta1,
    );
    expect(denied).toHaveLength(1);
    expect(denied[0]).toMatchObject({ actorId: PERSONA_IDS.chwAlpha1A, outcome: "denied" });
  });

  it("a non-worker persona is refused (ROLE)", async () => {
    const { sessions } = await setup();
    expect(await sessions.signIn(PERSONA_IDS.clinAlpha1, FACILITY_IDS.alpha1)).toMatchObject({
      ok: false,
      code: "FORBIDDEN",
      reason: "ROLE",
    });
  });

  it("sign-out ends the device session only; every other collection is untouched", async () => {
    const { sessions, sessionStore, store } = await setup();
    await sessions.signIn(PERSONA_IDS.chwAlpha1A, FACILITY_IDS.alpha1);
    const { deviceSessionId } = sessionStore.current()!;
    const skip = new Set(["deviceSessions", "remote_deviceSessions", "auditEvents"]);
    const collections = LOCAL_COLLECTIONS.filter((c) => !skip.has(c));
    const before = await Promise.all(collections.map((c) => store.getAll(c)));
    const auditCount = (await store.getAll("auditEvents")).length;

    await sessions.signOut();

    expect(await Promise.all(collections.map((c) => store.getAll(c)))).toEqual(before);
    expect((await store.get<DeviceSession>("deviceSessions", deviceSessionId))?.status).toBe(
      "ended",
    );
    const audits = await store.getAll<AuditEvent>("auditEvents");
    expect(audits).toHaveLength(auditCount + 1);
    expect(audits.filter((e) => e.action === "session.ended")).toHaveLength(1);
    expect(sessionStore.current()).toBeNull();
    expect(await sessions.restore()).toBe("signed_out");
  });

  it("restore after a restart keeps the session; a revoked record → revoked; a reset → signed_out", async () => {
    const first = await setup();
    await first.sessions.signIn(PERSONA_IDS.chwAlpha1A, FACILITY_IDS.alpha1);
    const restartedStore = createSessionStore(first.storage);
    const restartedRepo = createAppRepository({
      session: restartedStore,
      store: first.store,
      noLatency: true,
    });
    const restarted = createSessionRepo({ repo: restartedRepo, store: restartedStore });
    expect(await restarted.restore()).toBe("signed_in");

    await restartedRepo.sync.revokeDevice();
    expect(await restarted.restore()).toBe("revoked");
    await restartedRepo.sync.restoreDevice();
    expect(await restarted.restore()).toBe("signed_in");

    await restartedRepo.demo.resetDemo();
    expect(await restarted.restore()).toBe("signed_out");
    expect(restartedStore.current()).toBeNull();
  });

  it("HWM-02: the device slice follows the signed-in persona (default slice while signed out)", async () => {
    const { sessions, store } = await setup();
    const facilities = async () =>
      new Set((await store.getAll<{ facilityId: string }>("patients")).map((p) => p.facilityId));
    expect(await facilities()).toEqual(new Set([FACILITY_IDS.alpha1]));
    expect((await sessions.signIn(PERSONA_IDS.chwAlpha2A, FACILITY_IDS.alpha2)).ok).toBe(true);
    expect(await facilities()).toContain(FACILITY_IDS.alpha2);
    // Only parents of unsynced alpha-1 rows (the seed's draft) stay; repository reads are scoped.
    const screenings = await store.getAll<{ patientId: string }>("screenings");
    for (const p of await store.getAll<{ id: string; facilityId: string }>("patients")) {
      if (p.facilityId === FACILITY_IDS.alpha1) {
        expect(screenings.some((s) => s.patientId === p.id)).toBe(true);
      }
    }
    // Restore keeps it (no second refresh).
    expect(await sessions.restore()).toBe("signed_in");
    const refreshed = (await store.getAll<AuditEvent>("auditEvents")).filter(
      (e) => e.action === "demo.slice_refreshed",
    );
    expect(refreshed).toHaveLength(1);
  });
});
