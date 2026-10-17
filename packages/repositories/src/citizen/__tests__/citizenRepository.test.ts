import { actorForPersona } from "@laif/auth-demo";
import {
  createDemoClock,
  createSequentialIdGenerator,
  type AuditEvent,
  type DemoPersona,
} from "@laif/domain";
import {
  CITIZEN_OVERLAY_IDS,
  createSeed,
  PERSONA_IDS,
  SEED_ANCHORS,
  sliceForApp,
  type SeedDataset,
} from "@laif/mock-data";
import { describe, expect, it } from "vitest";

import { createBetterSqliteExecutor } from "../../../test/better-sqlite-executor.ts";
import { RepositoryError } from "../../errors.ts";
import { computeDatasetHash, datasetToRecords, readDatasetHash } from "../../seed-records.ts";
import { LOCAL_COLLECTIONS } from "../../store/collections.ts";
import { createMemoryStoreAdapter } from "../../store/memory-adapter.ts";
import { createSqliteStoreAdapter } from "../../store/sqlite-adapter.ts";
import type { StoreAdapter } from "../../store/store-adapter.ts";
import { createFaultInjector } from "../../transport/faults.ts";
import { createCitizenRepository } from "../create-citizen-repository.ts";

let cached: SeedDataset | null = null;
const seed = (): SeedDataset => {
  cached ??= createSeed();
  return structuredClone(cached);
};
const uuid = (n: number) => `00000000-0000-4000-8000-${n.toString(16).padStart(12, "0")}`;

const P1 = SEED_ANCHORS.CTZ_P1_APPOINTMENT_INSTRUCTION.patientId;
const P2 = SEED_ANCHORS.CTZ_P2_DISMISSED_SCREENING.patientId;
const P3 = SEED_ANCHORS.CTZ_P3_WITHDRAWN_PATIENT.patientId;
const P4 = SEED_ANCHORS.CTZ_P4_REPRESENTED_PATIENT.patientId;

async function setup(store: StoreAdapter, personaId: string | null = PERSONA_IDS.citizen1) {
  const personas = new Map(seed().personas.map((p) => [p.id as string, p]));
  const state = { personaId, n: 0 };
  const faults = createFaultInjector(7, { latencyMs: [0, 0] });
  const repo = createCitizenRepository({
    store,
    clock: createDemoClock(),
    ids: createSequentialIdGenerator("ctz-rt"),
    getActor: () =>
      state.personaId === null
        ? null
        : actorForPersona(personas.get(state.personaId) as DemoPersona),
    sleep: () => Promise.resolve(),
    seed,
    faults,
  });
  await repo.demo.ensureSeeded();
  return {
    repo,
    store,
    faults,
    key: () => uuid(++state.n),
    as: (id: string | null) => {
      state.personaId = id;
    },
    audits: (action: string) =>
      store
        .getAll<AuditEvent>("auditEvents")
        .then((events) => events.filter((e) => e.action === action)),
  };
}

const forbidden = async (promise: Promise<unknown>, reason: string) => {
  const error = await promise.then(
    () => null,
    (e: unknown) => e,
  );
  expect(error).toBeInstanceOf(RepositoryError);
  expect(error).toMatchObject({ code: "FORBIDDEN", reason });
};

const adapters: Array<[string, () => StoreAdapter]> = [
  ["memory", () => createMemoryStoreAdapter()],
  ["sqlite", () => createSqliteStoreAdapter(createBetterSqliteExecutor())],
];

describe.each(adapters)("CitizenRepository (%s adapter)", (_name, makeStore) => {
  it("seeds the citizen slice incl. overlay idempotently; reset restores counts and hash", async () => {
    const h = await setup(makeStore());
    const expected = computeDatasetHash(datasetToRecords(sliceForApp(seed(), "citizen")));
    expect(await readDatasetHash(h.store)).toBe(expected);
    const counts = async () =>
      Object.fromEntries(
        await Promise.all(
          LOCAL_COLLECTIONS.filter((c) => c !== "auditEvents").map(
            async (c) => [c, (await h.store.getAll(c)).length] as const,
          ),
        ),
      );
    const before = await counts();
    expect(before["citizenAccounts"]).toBe(5);
    expect(before["consentRecords"]).toBe(5);
    expect(await h.repo.demo.ensureSeeded()).toEqual({ seeded: false });

    await h.repo.acknowledgeInstruction(
      {
        patientId: P1,
        instructionId: SEED_ANCHORS.CTZ_P1_APPOINTMENT_INSTRUCTION.careInstructionId,
      },
      h.key(),
    );
    expect(await readDatasetHash(h.store)).not.toBe(expected);
    const state = await h.repo.demo.resetDemo();
    expect(state.datasetHash).toBe(expected);
    const after = await counts();
    expect({ ...after, idempotency: 0 }).toEqual({ ...before, idempotency: 0 });
    expect(await h.audits("demo.reset")).toHaveLength(1);
  });

  it("lists exactly the five personas with their states", async () => {
    const h = await setup(makeStore(), null);
    const personas = await h.repo.listPersonas();
    expect(personas.map((p) => [p.citizenCode, p.accountStatus])).toEqual([
      ["CTZ-P1", "active"],
      ["CTZ-P2", "active"],
      ["CTZ-P3", "active"],
      ["CTZ-P4", "active"],
      ["CTZ-P5", "pending_verification"],
    ]);
    expect(personas[2]?.patients[0]?.consentState).toBe("withdrawn");
    expect(personas[3]?.patients).toMatchObject([
      { patientId: P4, relationship: "legal_representative" },
    ]);
    expect(personas[4]?.patients).toEqual([]);
    expect(personas[4]?.verificationStatus).toBe("pending");
  });

  it("session: startSession writes session.started; signed out → null", async () => {
    const h = await setup(makeStore());
    const session = await h.repo.startSession();
    expect(session).toMatchObject({ personaId: PERSONA_IDS.citizen1, activePatientId: P1 });
    expect(await h.audits("session.started")).toHaveLength(1);
    h.as(null);
    expect(await h.repo.getSession()).toBeNull();
  });

  it("CTZ-P1: appointment + completed follow-up, never the unreleased referral", async () => {
    const h = await setup(makeStore());
    const steps = await h.repo.listApprovedInstructions(P1);
    const ids = steps.map((s) => s.id);
    expect(ids).toContain(SEED_ANCHORS.CTZ_P1_APPOINTMENT_INSTRUCTION.careInstructionId);
    expect(ids).toContain(SEED_ANCHORS.COMPLETED_FOLLOWUP_WITH_INSTRUCTION.careInstructionId);
    expect(
      steps.some((s) => s.sourceId === SEED_ANCHORS.CTZ_P1_UNRELEASED_REFERRAL.referralId),
    ).toBe(false);
    expect(steps.every((s) => s.approvalState === "approved" && s.status === "released")).toBe(
      true,
    );
    const appointment = steps.find(
      (s) => s.id === SEED_ANCHORS.CTZ_P1_APPOINTMENT_INSTRUCTION.careInstructionId,
    );
    expect(appointment).toMatchObject({
      progress: "planned",
      datePassed: false,
      appointmentAt: "2026-10-19T08:30:00.000Z",
    });
    const done = steps.find(
      (s) => s.id === SEED_ANCHORS.COMPLETED_FOLLOWUP_WITH_INSTRUCTION.careInstructionId,
    );
    expect(done?.progress).toBe("completed");
    expect(done?.acknowledgement).not.toBeNull();
  });

  it("CTZ-P1: released follow-up result and the amended observation with original retained", async () => {
    const h = await setup(makeStore());
    const items = await h.repo.listReleasedObservations(P1);
    expect(items.every((i) => i.kind === "released")).toBe(true);
    expect(items.some((i) => i.kind === "released" && i.label === "followUpAgreed")).toBe(true);
    const amended = await h.repo.getObservation(CITIZEN_OVERLAY_IDS.amendedScreening, P1);
    expect(amended.readings.glucoseContext).toBe("fasting");
    expect(amended.originalReadings?.glucoseContext).toBe("not_recorded");
    expect(await h.audits("citizen.result.viewed")).toHaveLength(1);
    const events = await h.repo.listAccessEvents(P1);
    expect(events[0]).toMatchObject({ actorId: PERSONA_IDS.citizen1, action: "result_viewed" });
  });

  it("CTZ-P2: dismissed screening as reviewedNoActionNeeded, newer one a value-less placeholder", async () => {
    const h = await setup(makeStore(), PERSONA_IDS.citizen2);
    const items = await h.repo.listReleasedObservations(P2);
    const dismissed = items.find(
      (i) => i.id === SEED_ANCHORS.CTZ_P2_DISMISSED_SCREENING.screeningId,
    );
    expect(dismissed).toMatchObject({ kind: "released", label: "reviewedNoActionNeeded" });
    const pending = items.find(
      (i) => i.id === SEED_ANCHORS.CTZ_P2_AWAITING_REVIEW_SCREENING.screeningId,
    );
    expect(pending).toEqual({
      kind: "pending_review",
      id: SEED_ANCHORS.CTZ_P2_AWAITING_REVIEW_SCREENING.screeningId,
      patientId: P2,
      measuredAt: expect.any(String) as string,
    });
    expect(items[0]?.kind).toBe("pending_review");
    expect(JSON.stringify(items)).not.toContain("measurement_error_suspected");
    await expect(
      h.repo.getObservation(SEED_ANCHORS.CTZ_P2_AWAITING_REVIEW_SCREENING.screeningId, P2),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
    const steps = await h.repo.listApprovedInstructions(P2);
    expect(
      steps.some((s) => s.id === SEED_ANCHORS.CTZ_P2_WITHDRAWN_INSTRUCTION.careInstructionId),
    ).toBe(false);
    expect(await h.repo.getNotificationPrefs(P2)).toMatchObject({ optedIn: false });
  });

  it("CTZ-P3: every health read throws CONSENT_REQUIRED and writes one access.denied each", async () => {
    const h = await setup(makeStore(), PERSONA_IDS.citizenWithdrawn);
    const reads = [
      () => h.repo.listReleasedObservations(P3),
      () => h.repo.listApprovedInstructions(P3),
      () => h.repo.listReminders(P3),
      () => h.repo.listTimeline(P3),
      () => h.repo.listAccessEvents(P3),
      () => h.repo.getNotificationPrefs(P3),
      () => h.repo.listCorrectionRequests(P3),
    ];
    for (const [index, read] of reads.entries()) {
      await forbidden(read(), "CONSENT_REQUIRED");
      expect(await h.audits("access.denied")).toHaveLength(index + 1);
    }
    expect(await h.repo.getConsent(P3)).toMatchObject({ state: "withdrawn" });
  });

  it("CTZ-P4: reading a patient outside its link throws FORBIDDEN SCOPE, no data (T-02)", async () => {
    const h = await setup(makeStore(), PERSONA_IDS.citizenRep);
    expect((await h.repo.listReleasedObservations(P4)).length).toBeGreaterThan(0);
    await forbidden(h.repo.listReleasedObservations(P1), "SCOPE");
    await forbidden(
      h.repo.getObservation(SEED_ANCHORS.CTZ_P2_DISMISSED_SCREENING.screeningId, P2),
      "SCOPE",
    );
    const denied = await h.audits("access.denied");
    expect(denied).toHaveLength(2);
    expect(denied[0]).toMatchObject({ outcome: "denied", actorId: PERSONA_IDS.citizenRep });
    expect(await h.audits("citizen.result.viewed")).toHaveLength(0);
  });

  it("CTZ-P5 (pending) has no linked patient: reads are FORBIDDEN", async () => {
    const h = await setup(makeStore(), PERSONA_IDS.citizenPending);
    await forbidden(h.repo.listReleasedObservations(P1), "SCOPE");
    expect((await h.repo.getSession())?.account?.status).toBe("pending_verification");
  });

  it("non-citizen roles are denied by role", async () => {
    const h = await setup(makeStore(), PERSONA_IDS.clinAlpha1);
    await forbidden(h.repo.listReleasedObservations(P1), "ROLE");
  });

  it("acknowledgeInstruction replay with the same key returns the same ack; one row (T-04)", async () => {
    const h = await setup(makeStore());
    const input = {
      patientId: P1,
      instructionId: SEED_ANCHORS.CTZ_P1_APPOINTMENT_INSTRUCTION.careInstructionId,
    };
    const key = h.key();
    const first = await h.repo.acknowledgeInstruction(input, key);
    const replay = await h.repo.acknowledgeInstruction(input, key);
    expect(replay.replayed).toBe(true);
    expect(replay.data.id).toBe(first.data.id);
    const other = await h.repo.acknowledgeInstruction(input, h.key());
    expect(other.data.id).toBe(first.data.id);
    const rows = (await h.store.getAll<{ instructionId: string }>("nextStepAcks")).filter(
      (a) => a.instructionId === input.instructionId,
    );
    expect(rows).toHaveLength(1);
    expect(await h.audits("citizen.next_step.acknowledged")).toHaveLength(1);
    await expect(
      h.repo.acknowledgeInstruction(
        {
          patientId: P1,
          instructionId: SEED_ANCHORS.CTZ_P2_WITHDRAWN_INSTRUCTION.careInstructionId,
        },
        h.key(),
      ),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
  });

  it("stale expectedVersion on prefs throws CONFLICT with latest; row unchanged (T-05)", async () => {
    const h = await setup(makeStore());
    const prefs = await h.repo.getNotificationPrefs(P1);
    expect(prefs).not.toBeNull();
    const updated = await h.repo.updateNotificationPrefs(
      { patientId: P1, expectedVersion: prefs!.version, optedIn: true, timing: "morning_of" },
      h.key(),
    );
    expect(updated.entityVersion).toBe(prefs!.version + 1);
    const error = await h.repo
      .updateNotificationPrefs(
        { patientId: P1, expectedVersion: prefs!.version, optedIn: false, timing: "day_before" },
        h.key(),
      )
      .catch((e: unknown) => e);
    expect(error).toMatchObject({ code: "CONFLICT" });
    expect((error as RepositoryError).conflict?.latest).toMatchObject({ timing: "morning_of" });
    expect(await h.repo.getNotificationPrefs(P1)).toEqual(updated.data);
    const scheduled = (await h.repo.listReminders(P1)).filter((r) => r.status === "scheduled");
    expect(scheduled.length).toBeGreaterThan(0);
  });

  it("opting out cancels scheduled reminders only (opted_out)", async () => {
    const h = await setup(makeStore());
    const prefs = await h.repo.getNotificationPrefs(P1);
    await h.repo.updateNotificationPrefs(
      { patientId: P1, expectedVersion: prefs!.version, optedIn: false, timing: "day_before" },
      h.key(),
    );
    const reminders = await h.repo.listReminders(P1);
    expect(reminders.some((r) => r.status === "scheduled")).toBe(false);
    expect(reminders.filter((r) => r.cancelReason === "opted_out").length).toBeGreaterThan(0);
    expect(reminders.some((r) => r.status === "acknowledged")).toBe(true);
  });

  it("consent withdraw → reads blocked, reminders cancelled; re-grant restores access", async () => {
    const h = await setup(makeStore());
    const withdrawn = await h.repo.recordConsent({ patientId: P1, action: "withdrawn" }, h.key());
    expect(withdrawn.data.action).toBe("withdrawn");
    await forbidden(h.repo.listReleasedObservations(P1), "CONSENT_REQUIRED");
    expect((await h.repo.getConsent(P1)).history.map((c) => c.action)).toEqual([
      "granted",
      "withdrawn",
    ]);
    await expect(
      h.repo.recordConsent({ patientId: P1, action: "withdrawn" }, h.key()),
    ).rejects.toMatchObject({ code: "VALIDATION_ERROR", reason: "INVALID_TRANSITION" });
    await h.repo.recordConsent({ patientId: P1, action: "granted" }, h.key());
    const reminders = await h.repo.listReminders(P1);
    expect(reminders.some((r) => r.cancelReason === "consent_withdrawn")).toBe(true);
    expect(await h.audits("citizen.consent.withdrawn")).toHaveLength(1);
    expect(await h.audits("citizen.consent.granted")).toHaveLength(1);
    const patient = await h.store.get<{ consentState: string }>("patients", P1);
    expect(patient?.consentState).toBe("granted");
  });

  it("correction request creates a task and never edits the record (WF-04.4)", async () => {
    const h = await setup(makeStore());
    const before = await h.store.get("screenings", CITIZEN_OVERLAY_IDS.amendedScreening);
    const result = await h.repo.createCorrectionRequest(
      {
        patientId: P1,
        targetType: "screening",
        targetId: CITIZEN_OVERLAY_IDS.amendedScreening,
        description: "The time of this check looks wrong to me.",
      },
      h.key(),
    );
    expect(result.data).toMatchObject({ kind: "correction_request", status: "open" });
    expect(await h.store.get("screenings", CITIZEN_OVERLAY_IDS.amendedScreening)).toEqual(before);
    const requests = await h.repo.listCorrectionRequests(P1);
    expect(requests.find((r) => r.id === result.data.id)?.status).toBe("submitted");
    expect(
      requests.find((r) => r.id === CITIZEN_OVERLAY_IDS.resolvedAmendedCorrection)?.status,
    ).toBe("resolved_amended");
    expect(await h.audits("correction.requested")).toHaveLength(2); // seed + this one
    await expect(
      h.repo.createCorrectionRequest(
        {
          patientId: P1,
          targetType: "screening",
          targetId: SEED_ANCHORS.CTZ_P2_DISMISSED_SCREENING.screeningId,
          description: "Not my record but trying anyway.",
        },
        h.key(),
      ),
    ).rejects.toMatchObject({ code: "VALIDATION_ERROR" });
  });

  it("callback request creates a callback task", async () => {
    const h = await setup(makeStore());
    const result = await h.repo.createCallbackRequest(
      { patientId: P1, topic: "appointment_question", window: "morning" },
      h.key(),
    );
    expect(result.data).toMatchObject({ kind: "callback_request", payload: { note: "" } });
    expect(await h.audits("citizen.support.callback_requested")).toHaveLength(1);
  });

  it("settings: read, update and conflict", async () => {
    const h = await setup(makeStore());
    const settings = await h.repo.getSettings();
    expect(settings).toMatchObject({ language: "rw", textScale: 1 });
    const updated = await h.repo.updateSettings(
      { expectedVersion: settings!.version, textScale: 1.3 },
      h.key(),
    );
    expect(updated.data).toMatchObject({ textScale: 1.3, language: "rw" });
    await expect(
      h.repo.updateSettings({ expectedVersion: settings!.version, highContrast: true }, h.key()),
    ).rejects.toMatchObject({ code: "CONFLICT" });
    expect(await h.audits("citizen.settings.changed")).toHaveLength(1);
  });

  it("timeline: derived items newest first; reminders are never done", async () => {
    const h = await setup(makeStore());
    const items = await h.repo.listTimeline(P1);
    expect(items.length).toBeGreaterThan(0);
    const sorted = [...items].sort((a, b) => (a.occurredAt < b.occurredAt ? 1 : -1));
    expect(items.map((i) => i.occurredAt)).toEqual(sorted.map((i) => i.occurredAt));
    expect(items.filter((i) => i.kind === "reminder_sent").every((i) => i.state === "info")).toBe(
      true,
    );
    expect(items.some((i) => i.kind === "record_updated")).toBe(true);
  });

  it("simulated transport: error500 / unavailable faults reject before running", async () => {
    const h = await setup(makeStore());
    await h.repo.demo.setFaults({ serverErrorRate: 1 });
    await expect(h.repo.listReleasedObservations(P1)).rejects.toMatchObject({ code: "INTERNAL" });
    await h.repo.demo.setFaults({ serverErrorRate: 0, dependencyUnavailableRate: 1 });
    await expect(h.repo.listReleasedObservations(P1)).rejects.toMatchObject({
      code: "DEPENDENCY_UNAVAILABLE",
    });
    await h.repo.demo.setFaults({ dependencyUnavailableRate: 0 });
    const prefs = await h.repo.getNotificationPrefs(P1);
    await h.repo.demo.setFaults({
      conflictOnce: [{ entityType: "reminder_preference", entityId: prefs!.id }],
    });
    await expect(
      h.repo.updateNotificationPrefs(
        { patientId: P1, expectedVersion: prefs!.version, optedIn: true, timing: "day_before" },
        h.key(),
      ),
    ).rejects.toMatchObject({ code: "CONFLICT" });
  });
});

describe.each(adapters)("CitizenRepository CTZ-02 access (%s adapter)", (_name, makeStore) => {
  it("startSession({ personaSelected }) records the choice; endSession records session.ended", async () => {
    const h = await setup(makeStore());
    await h.repo.startSession({ personaSelected: true });
    expect(await h.audits("citizen.persona.selected")).toHaveLength(1);
    await h.repo.startSession();
    expect(await h.audits("citizen.persona.selected")).toHaveLength(1);
    expect(await h.repo.endSession()).toEqual({ personaId: PERSONA_IDS.citizen1 });
    expect(await h.audits("session.ended")).toHaveLength(1);
    h.as(null);
    expect(await h.repo.endSession()).toBeNull();
  });

  it("CTZ-P5: only the demo code verifies; wrong codes are recorded attempts", async () => {
    const h = await setup(makeStore(), PERSONA_IDS.citizenPending);
    const wrong = await h.repo.verifyIdentity({ code: "111111" }, h.key());
    expect(wrong.data).toMatchObject({ status: "failed", attempts: 1, verifiedAt: null });
    expect((await h.repo.getSession())?.account?.status).toBe("pending_verification");
    expect(await h.audits("citizen.identity.verification_failed")).toHaveLength(1);

    const ok = await h.repo.verifyIdentity({ code: "246810" }, h.key());
    expect(ok.data).toMatchObject({ status: "verified", attempts: 2 });
    expect((await h.repo.getSession())?.account?.status).toBe("active");
    expect(await h.audits("citizen.identity.verification_attempted")).toHaveLength(2);
    expect(await h.audits("citizen.identity.verified")).toHaveLength(1);
    await expect(h.repo.verifyIdentity({ code: "246810" }, h.key())).rejects.toMatchObject({
      code: "VALIDATION_ERROR",
      reason: "INVALID_TRANSITION",
    });
  });

  it("locks after five wrong codes; the demo code no longer works", async () => {
    const h = await setup(makeStore(), PERSONA_IDS.citizenPending);
    let last = null as Awaited<ReturnType<typeof h.repo.verifyIdentity>> | null;
    for (let n = 0; n < 5; n += 1) last = await h.repo.verifyIdentity({ code: "000000" }, h.key());
    expect(last?.data).toMatchObject({ status: "locked", attempts: 5 });
    expect((await h.repo.getSession())?.account?.status).toBe("locked");
    await expect(h.repo.verifyIdentity({ code: "246810" }, h.key())).rejects.toMatchObject({
      code: "VALIDATION_ERROR",
    });
  });

  it("malformed codes are VALIDATION_ERROR (nothing recorded)", async () => {
    const h = await setup(makeStore(), PERSONA_IDS.citizenPending);
    await expect(h.repo.verifyIdentity({ code: "12a" }, h.key())).rejects.toMatchObject({
      code: "VALIDATION_ERROR",
    });
    expect(await h.audits("citizen.identity.verification_attempted")).toHaveLength(0);
  });

  it("unavailable service changes nothing, audits it, and never verifies (T-07)", async () => {
    const h = await setup(makeStore(), PERSONA_IDS.citizenPending);
    await h.repo.demo.setFaults({ dependencyUnavailableRate: 1 });
    const key = h.key();
    await expect(h.repo.verifyIdentity({ code: "246810" }, key)).rejects.toMatchObject({
      code: "DEPENDENCY_UNAVAILABLE",
    });
    expect(await h.audits("citizen.identity.verification_unavailable")).toHaveLength(1);
    expect(await h.audits("citizen.identity.verification_attempted")).toHaveLength(0);
    await h.repo.demo.setFaults({ dependencyUnavailableRate: 0 });
    expect((await h.repo.getSession())?.verification?.status).toBe("pending");
    // Retry with the SAME key (T-09) runs once; a second replay returns the same outcome.
    const first = await h.repo.verifyIdentity({ code: "246810" }, key);
    const replay = await h.repo.verifyIdentity({ code: "246810" }, key);
    expect(first.replayed).toBe(false);
    expect(replay.replayed).toBe(true);
    expect(replay.data.id).toBe(first.data.id);
    expect(await h.audits("citizen.identity.verified")).toHaveLength(1);
  });

  it("recordGuardDenial writes one access.denied CONSENT_REQUIRED", async () => {
    const h = await setup(makeStore(), PERSONA_IDS.citizenWithdrawn);
    const before = (await h.audits("access.denied")).length;
    await h.repo.recordGuardDenial({ patientId: P3, route: "/health" });
    const denied = await h.audits("access.denied");
    expect(denied).toHaveLength(before + 1);
    expect(denied.at(-1)).toMatchObject({ outcome: "denied", entityId: P3 });
  });
});
