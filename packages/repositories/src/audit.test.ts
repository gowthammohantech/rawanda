import { enResources, rwResources, rwReviewFlags } from "@laif/i18n";
import type { AuditEvent, FollowUp, Referral, Review } from "@laif/domain";
import { applyScenario, PERSONA_IDS, SCENARIO_IDS } from "@laif/mock-data";
import { describe, expect, it } from "vitest";

import {
  AUDIT_ACTION_NAMES,
  AUDIT_ACTIONS,
  auditActionLabelKey,
  CLIENT_AUDIT_ACTIONS,
  isAuditAction,
} from "./audit/actions.ts";
import { buildAuditEvent, emitAudit } from "./audit/emit.ts";
import { createMemoryStoreAdapter } from "./store/memory-adapter.ts";
import { createHarness, testSeed } from "./testing/harness.ts";

function lookup(catalogue: object, dotted: string): unknown {
  let node: unknown = catalogue;
  for (const part of dotted.split(".")) {
    if (typeof node !== "object" || node === null) return undefined;
    node = (node as Record<string, unknown>)[part];
  }
  return node;
}

const baseEvent = {
  id: "a1",
  action: "patient.viewed" as const,
  actorId: null,
  actorRole: null,
  entityType: "patient" as const,
  entityId: "p1",
  occurredAt: "2026-10-14T06:00:00.000Z",
  correlationId: "c1" as AuditEvent["correlationId"],
};

describe("audit action registry", () => {
  it("registers every action used by the seed and by every scenario", () => {
    const used = new Set(testSeed().auditEvents.map((e) => e.action));
    for (const id of SCENARIO_IDS) {
      for (const e of applyScenario(testSeed(), id).auditEvents) used.add(e.action);
    }
    const missing = [...used].filter((a) => !isAuditAction(a));
    expect(missing).toEqual([]);
  });

  it("contains every canonical cross-cutting action and the FND-07 §6 list", () => {
    for (const action of [
      "session.started",
      "session.ended",
      "session.expired",
      "access.denied",
      "export.requested",
      "export.generated",
      "export.denied",
      "demo.reset",
      "conflict.detected",
      "conflict.resolved",
      "sync.duplicate_suppressed",
      "task.created",
      "correction.requested",
      "patient.viewed",
      "review.viewed",
      "patient.registered",
      "screening.draft_saved",
      "screening.submitted",
      "screening.amended",
      "review.started",
      "review.decided",
      "review.dismissed",
      "referral.created",
      "referral.transitioned",
      "followup.created",
      "followup.attempt_recorded",
      "followup.outcome_recorded",
      "followup.reassigned",
      "task.updated",
      "reminder.preference_changed",
      "instruction.released",
      "sync.op_acknowledged",
      "sync.conflict_resolved",
      "demo.scenario_loaded",
      "session.ended",
      "sync.op_rejected",
      "device.revoked",
      "device.restored",
    ]) {
      expect(isAuditAction(action), action).toBe(true);
    }
    expect(AUDIT_ACTIONS["sync.duplicate_suppressed"].category).toBe("security");
    expect(CLIENT_AUDIT_ACTIONS).toContain("session.started");
    expect(CLIENT_AUDIT_ACTIONS).not.toContain("review.decided");
  });

  it("uses dot names with no app-prefixed variants of canonical actions", () => {
    for (const action of AUDIT_ACTION_NAMES) {
      expect(action).toMatch(/^[a-z][a-z_]*(\.[a-z_]+)+$/u);
      expect(action).not.toMatch(
        /^(admin|citizen|clinical|worker)\.(session|access|export|demo)\./u,
      );
    }
  });

  it("every action has EN + RW copy at domain:audit.<action>, RW flagged for review", () => {
    for (const action of AUDIT_ACTION_NAMES) {
      const key = auditActionLabelKey(action);
      const path = key.replace(/^domain:/u, "");
      expect(typeof lookup(enResources.domain, path), `en ${key}`).toBe("string");
      expect(typeof lookup(rwResources.domain, path), `rw ${key}`).toBe("string");
      expect(rwReviewFlags[key], key).toBeDefined();
    }
  });

  it("emitAudit refuses unregistered actions and is append-only", async () => {
    const store = createMemoryStoreAdapter();
    expect(() => buildAuditEvent({ ...baseEvent, action: "patient.read" as never })).toThrow(
      /unregistered/,
    );
    await store.transaction((tx) => emitAudit(tx, baseEvent));
    await expect(store.transaction((tx) => emitAudit(tx, baseEvent))).rejects.toThrow(
      /append-only/,
    );
    const event = buildAuditEvent({ ...baseEvent, before: { a: 1 }, after: { a: 2 } });
    expect(event.beforeHash).toMatch(/^[0-9a-f]{16}$/u);
    expect(event.afterHash).not.toBe(event.beforeHash);
    expect(event.category).toBe("access");
  });
});

describe("audit trail behaviour", () => {
  it("correlation id propagates screening → review → referral → follow-up (WF-01.10)", async () => {
    const h = await createHarness({ personaId: PERSONA_IDS.chwAlpha1A });
    const patient = h.seed.patients.find((p) => p.facilityId === "fac-alpha-1")!;
    const screening = await h.repo.createScreening(
      {
        patientId: patient.id,
        measuredAt: "2026-10-14T05:00:00.000Z",
        systolic: 170,
        diastolic: 100,
      },
      h.key(),
    );
    const review = (await h.store.getAll<Review>("reviews")).find(
      (r) => r.screeningId === screening.data.id,
    )!;
    h.as(PERSONA_IDS.clinAlpha1);
    await h.repo.decideReview(
      {
        kind: "refer",
        reviewId: review.id,
        expectedVersion: review.version,
        destinationFacilityId: "fac-alpha-2",
        referralReason: "Very high reading on the demo screening.",
        dueAt: "2026-10-20T06:00:00.000Z",
        priority: "urgent_demo",
      },
      h.key(),
    );
    const referral = (await h.store.getAll<Referral>("referrals")).find(
      (r) => r.reviewId === review.id,
    )!;
    const followUp = await h.repo.createFollowUp(
      {
        patientId: patient.id,
        purpose: "referral_attendance",
        dueAt: "2026-10-21T06:00:00.000Z",
        assignedWorkerId: PERSONA_IDS.chwAlpha1A,
        referralId: referral.id,
      },
      h.key(),
    );
    const events = await h.store.getAll<AuditEvent>("auditEvents");
    const chain = [screening.data.id, review.id, referral.id, followUp.data.id].map((id) =>
      events.find((e) => e.entityId === id && e.category === "change")!,
    );
    expect(chain.map((e) => e.action)).toEqual([
      "screening.submitted",
      "review.created",
      "referral.created",
      "followup.created",
    ]);
    expect(new Set(chain.map((e) => e.correlationId)).size).toBe(1);
    const decided = events.find((e) => e.action === "review.decided" && e.entityId === review.id)!;
    expect(decided.correlationId).toBe(chain[0]!.correlationId);
    expect(decided).toMatchObject({
      actorId: PERSONA_IDS.clinAlpha1,
      actorRole: "clinician",
      facilityId: "fac-alpha-1",
      districtId: "dist-alpha",
      patientId: patient.id,
    });
    expect(decided.beforeHash).toBeDefined();
    expect(decided.afterHash).toBeDefined();
    const fu = (await h.store.get<FollowUp>("followUps", followUp.data.id))!;
    expect(fu.referralId).toBe(referral.id);
  });

  it("sensitive reads are audited once per actor + entity per demo minute", async () => {
    const h = await createHarness({ personaId: PERSONA_IDS.clinAlpha1 });
    const patient = h.seed.patients.find((p) => p.facilityId === "fac-alpha-1")!;
    const viewed = async () =>
      (await h.store.getAll<AuditEvent>("auditEvents")).filter(
        (e) => e.action === "patient.viewed" && e.entityId === patient.id,
      ).length;
    await h.repo.getPatient(patient.id);
    await h.repo.getPatient(patient.id);
    expect(await viewed()).toBe(1);
    h.clock.advanceBy(61_000);
    await h.repo.getPatient(patient.id);
    expect(await viewed()).toBe(2);
    h.as(PERSONA_IDS.coordAlpha);
    await h.repo.getPatient(patient.id);
    expect(await viewed()).toBe(3);
    expect(await h.repo.getPatient("missing")).toBeNull();
  });

  it("listAuditEvents filters, pages newest-first and audits the view", async () => {
    const h = await createHarness({ personaId: PERSONA_IDS.coordAlpha });
    const page = await h.repo.listAuditEvents({ action: "review.", pageSize: 5 });
    expect(page.items.length).toBeGreaterThan(0);
    expect(page.items.every((e) => e.action.startsWith("review."))).toBe(true);
    const times = page.items.map((e) => e.occurredAt);
    expect([...times].sort().reverse()).toEqual(times);
    const exact = await h.repo.listAuditEvents({
      action: "review.decided",
      categories: ["change"],
    });
    expect(exact.items.every((e) => e.action === "review.decided")).toBe(true);
    const own = await h.repo.listAuditEvents({
      actorId: PERSONA_IDS.coordAlpha,
      outcome: "success",
    });
    expect(own.items.map((e) => e.action)).toContain("audit.viewed");
    const ranged = await h.repo.listAuditEvents({
      from: "2026-10-01T00:00:00.000Z",
      to: "2026-10-14T06:00:00.000Z",
      entityType: "review",
      facilityIds: ["fac-alpha-1"],
    });
    expect(ranged.items.every((e) => e.facilityId === "fac-alpha-1")).toBe(true);
    await expect(h.repo.listAuditEvents({ facilityIds: ["fac-beta-1"] })).rejects.toMatchObject({
      code: "FORBIDDEN",
    });
    const chw = await createHarness({ personaId: PERSONA_IDS.chwAlpha1A });
    await expect(chw.repo.listAuditEvents()).rejects.toMatchObject({ reason: "ROLE" });
  });

  it("recordAuditEvent accepts client actions only", async () => {
    const h = await createHarness({ personaId: PERSONA_IDS.clinAlpha1 });
    const started = await h.repo.recordAuditEvent({ action: "session.started" });
    expect(started).toMatchObject({
      action: "session.started",
      category: "access",
      entityType: "persona",
      entityId: PERSONA_IDS.clinAlpha1,
      changeSummary: { origin: "client" },
    });
    const denied = await h.repo.recordAuditEvent({
      action: "access.denied",
      outcome: "denied",
      facilityId: "fac-beta-1",
      changeSummary: { route: "/clinical/patients/x" },
    });
    expect(denied).toMatchObject({
      outcome: "denied",
      facilityId: "fac-beta-1",
      districtId: "dist-beta",
    });
    await expect(h.repo.recordAuditEvent({ action: "review.decided" })).rejects.toMatchObject({
      code: "VALIDATION_ERROR",
    });
    await expect(h.repo.recordAuditEvent({ action: "Bad Action" })).rejects.toMatchObject({
      fieldErrors: { action: { key: "invalidFormat" } },
    });
    h.as(null);
    const anon = await h.repo.recordAuditEvent({ action: "session.expired" });
    expect(anon).toMatchObject({ actorId: null, entityType: "audit_event" });
  });

  it("recordAuditEvent keeps a given session correlationId (ADM-01)", async () => {
    const h = await createHarness({ appId: "admin", personaId: PERSONA_IDS.analystAlpha });
    const correlationId = "corr-admin-session-1";
    const started = await h.repo.recordAuditEvent({ action: "session.started", correlationId });
    const denied = await h.repo.recordAuditEvent({
      action: "access.denied",
      outcome: "denied",
      entityType: "district",
      entityId: "/admin/overview",
      correlationId,
    });
    expect(started.correlationId).toBe(correlationId);
    expect(denied).toMatchObject({ correlationId, entityType: "district", outcome: "denied" });
  });
});
