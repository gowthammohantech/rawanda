import { actorForPersona } from "@laif/auth-demo";
import {
  createDemoClock,
  hashCanonical,
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

  it("CTZ-P4: another patient's result id via the own patient → FORBIDDEN SCOPE + access.denied (CTZ-03)", async () => {
    const h = await setup(makeStore(), PERSONA_IDS.citizenRep);
    const marie = (await setup(makeStore())).repo;
    const p1Result = (await marie.listReleasedObservations(P1)).find((o) => o.kind === "released");
    expect(p1Result).toBeDefined();
    await forbidden(h.repo.getObservation(p1Result!.id, P4), "SCOPE");
    const denied = await h.audits("access.denied");
    expect(denied).toHaveLength(1);
    expect(denied[0]).toMatchObject({
      outcome: "denied",
      entityType: "screening",
      entityId: p1Result!.id,
      actorId: PERSONA_IDS.citizenRep,
    });
    expect(await h.audits("citizen.result.viewed")).toHaveLength(0);
    // An unknown id stays NOT_FOUND (nothing to deny).
    await expect(h.repo.getObservation("scr-unknown", P4)).rejects.toMatchObject({
      code: "NOT_FOUND",
    });
  });

  it("recordResultsListViewed: one record_viewed access event + citizen.result.list_viewed per call (CTZ-03)", async () => {
    const h = await setup(makeStore());
    await h.repo.recordResultsListViewed(P1);
    await h.repo.recordResultsListViewed(P1);
    expect(await h.audits("citizen.result.list_viewed")).toHaveLength(2);
    const events = (await h.repo.listAccessEvents(P1)).filter(
      (e) => e.action === "record_viewed" && e.actorId === PERSONA_IDS.citizen1,
    );
    expect(events).toHaveLength(2);
    expect(events[0]).toMatchObject({
      actorId: PERSONA_IDS.citizen1,
      purpose: "self_access",
      resourceType: "patient",
      resourceId: P1,
    });
    h.as(PERSONA_IDS.citizenWithdrawn);
    await forbidden(h.repo.recordResultsListViewed(P3), "CONSENT_REQUIRED");
    h.as(PERSONA_IDS.citizenRep);
    await forbidden(h.repo.recordResultsListViewed(P1), "SCOPE");
    expect(await h.audits("citizen.result.list_viewed")).toHaveLength(2);
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

  it("CTZ-04 getInstruction: approved step + one citizen.next_step.viewed; others denied alike", async () => {
    const h = await setup(makeStore());
    const id = SEED_ANCHORS.CTZ_P1_APPOINTMENT_INSTRUCTION.careInstructionId;
    const step = await h.repo.getInstruction(id, P1);
    expect(step).toMatchObject({ id, approvalState: "approved", progress: "planned" });
    await h.repo.getInstruction(id, P1); // same demo minute → de-duplicated
    expect(await h.audits("citizen.next_step.viewed")).toHaveLength(1);
    const events = await h.repo.listAccessEvents(P1);
    expect(events[0]).toMatchObject({ action: "next_steps_viewed", resourceId: id });

    // Withdrawn (P2's), unreleased referral (P1's draft), unknown → the same FORBIDDEN SCOPE.
    for (const other of [
      SEED_ANCHORS.CTZ_P2_WITHDRAWN_INSTRUCTION.careInstructionId,
      SEED_ANCHORS.CTZ_P1_UNRELEASED_REFERRAL.referralId,
      "no-such-step",
    ]) {
      await forbidden(h.repo.getInstruction(other, P1), "SCOPE");
    }
    const denied = await h.audits("access.denied");
    expect(denied.map((d) => d.entityId)).toEqual([
      SEED_ANCHORS.CTZ_P2_WITHDRAWN_INSTRUCTION.careInstructionId,
      SEED_ANCHORS.CTZ_P1_UNRELEASED_REFERRAL.referralId,
      "no-such-step",
    ]);
    expect(denied.every((d) => d.entityType === "care_instruction")).toBe(true);

    // P2's own withdrawn step is unreachable too.
    h.as(PERSONA_IDS.citizen2);
    await forbidden(
      h.repo.getInstruction(SEED_ANCHORS.CTZ_P2_WITHDRAWN_INSTRUCTION.careInstructionId, P2),
      "SCOPE",
    );
    expect(
      (await h.repo.listApprovedInstructions(P2)).some(
        (i) => i.id === SEED_ANCHORS.CTZ_P2_WITHDRAWN_INSTRUCTION.careInstructionId,
      ),
    ).toBe(false);
  });

  it("CTZ-04 recordNextStepsListViewed: one next_steps_viewed event + list_viewed per call", async () => {
    const h = await setup(makeStore());
    await h.repo.recordNextStepsListViewed(P1);
    await h.repo.recordNextStepsListViewed(P1);
    expect(await h.audits("citizen.next_step.list_viewed")).toHaveLength(2);
    const before = (await setup(makeStore()).then((x) => x.repo.listAccessEvents(P1))).length;
    const events = await h.repo.listAccessEvents(P1);
    expect(events.length - before).toBe(2);
    expect(events.slice(0, 2).map((e) => [e.action, e.resourceType])).toEqual([
      ["next_steps_viewed", "patient"],
      ["next_steps_viewed", "patient"],
    ]);
    h.as(PERSONA_IDS.citizenWithdrawn);
    await forbidden(h.repo.recordNextStepsListViewed(P3), "CONSENT_REQUIRED");
  });

  it("CTZ-06 recordTimelineViewed: one record_viewed event + citizen.timeline.viewed per call", async () => {
    const h = await setup(makeStore());
    await h.repo.recordTimelineViewed(P1);
    await h.repo.recordTimelineViewed(P1);
    expect(await h.audits("citizen.timeline.viewed")).toHaveLength(2);
    const events = await h.repo.listAccessEvents(P1);
    expect(events.slice(0, 2).map((e) => [e.action, e.resourceType, e.purpose])).toEqual([
      ["record_viewed", "patient", "self_access"],
      ["record_viewed", "patient", "self_access"],
    ]);
    h.as(PERSONA_IDS.citizenWithdrawn);
    await forbidden(h.repo.recordTimelineViewed(P3), "CONSENT_REQUIRED");
  });

  it("CTZ-06 recordChangeViewed: amended result only, de-duplicated; others NOT_FOUND / SCOPE", async () => {
    const h = await setup(makeStore());
    const amended = CITIZEN_OVERLAY_IDS.amendedScreening;
    await h.repo.recordChangeViewed(P1, amended);
    await h.repo.recordChangeViewed(P1, amended); // same demo minute → de-duplicated
    const audits = await h.audits("citizen.change.viewed");
    expect(audits).toHaveLength(1);
    expect(audits[0]).toMatchObject({ entityType: "screening", entityId: amended });
    expect((await h.repo.listAccessEvents(P1))[0]).toMatchObject({
      action: "result_viewed",
      resourceType: "screening",
      resourceId: amended,
    });
    // A released result without amendments → NOT_FOUND (no change to show), no audit.
    const plain = (await h.repo.listReleasedObservations(P1)).find(
      (o) => o.kind === "released" && o.amendments.length === 0,
    );
    await expect(h.repo.recordChangeViewed(P1, plain!.id)).rejects.toMatchObject({
      code: "NOT_FOUND",
    });
    // Another patient's screening via P1 → FORBIDDEN SCOPE + access.denied.
    await forbidden(
      h.repo.recordChangeViewed(P1, SEED_ANCHORS.CTZ_P2_DISMISSED_SCREENING.screeningId),
      "SCOPE",
    );
    expect(await h.audits("citizen.change.viewed")).toHaveLength(1);
  });

  it("CTZ-04 completed follow-up carries completion evidence; ack audit keeps the key", async () => {
    const h = await setup(makeStore());
    const done = (await h.repo.listApprovedInstructions(P1)).find(
      (i) => i.id === SEED_ANCHORS.COMPLETED_FOLLOWUP_WITH_INSTRUCTION.careInstructionId,
    );
    expect(done?.completion?.evidenceType).not.toBeNull();
    const key = h.key();
    await h.repo.acknowledgeInstruction(
      {
        patientId: P1,
        instructionId: SEED_ANCHORS.CTZ_P1_APPOINTMENT_INSTRUCTION.careInstructionId,
      },
      key,
    );
    const [event] = await h.audits("citizen.next_step.acknowledged");
    expect(event?.changeSummary).toMatchObject({ idempotencyKey: key, instructionVersion: 1 });
    expect(event?.entityType).toBe("care_instruction");
    expect(event?.correlationId).toBeTruthy();
  });

  it("CTZ-04 ack conflict (T-05): stale version or the patient conflict toggle → CONFLICT, no row", async () => {
    const h = await setup(makeStore());
    const instructionId = SEED_ANCHORS.CTZ_P1_APPOINTMENT_INSTRUCTION.careInstructionId;
    const rows = async () =>
      (await h.store.getAll<{ instructionId: string }>("nextStepAcks")).filter(
        (a) => a.instructionId === instructionId,
      );
    await expect(
      h.repo.acknowledgeInstruction({ patientId: P1, instructionId, expectedVersion: 99 }, h.key()),
    ).rejects.toMatchObject({ code: "CONFLICT" });
    expect(await rows()).toHaveLength(0);

    await h.repo.demo.setFaults({ conflictOnce: [{ entityType: "patient", entityId: P1 }] });
    const key = h.key();
    const error = await h.repo
      .acknowledgeInstruction({ patientId: P1, instructionId, expectedVersion: 1 }, key)
      .then(
        () => null,
        (e: unknown) => e,
      );
    expect(error).toMatchObject({ code: "CONFLICT" });
    expect((error as RepositoryError).conflict?.latest).toMatchObject({ id: instructionId });
    expect(await rows()).toHaveLength(0);
    expect(await h.audits("conflict.detected")).toHaveLength(2);
    expect((await h.repo.demo.getFaults()).conflictOnce).toEqual([]);
    // The toggle is consumed: the next acknowledgement (re-read, new action) is saved once.
    const ok = await h.repo.acknowledgeInstruction(
      { patientId: P1, instructionId, expectedVersion: 1 },
      h.key(),
    );
    expect(ok.data.instructionId).toBe(instructionId);
    expect(await rows()).toHaveLength(1);
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
    // The enrolment record stays hidden until verified.
    expect((await h.repo.getSession())?.activePatientId).toBeNull();
    await expect(h.repo.getConsent(CITIZEN_OVERLAY_IDS.pendingPatient)).rejects.toMatchObject({
      code: "FORBIDDEN",
      reason: "SCOPE",
    });
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
    // Verified → own record linked, but still behind consent (no health data before consent).
    const session = await h.repo.getSession();
    expect(session?.activePatientId).toBe(CITIZEN_OVERLAY_IDS.pendingPatient);
    expect(session?.patients).toMatchObject([
      { relationship: "self", consentState: "not_recorded" },
    ]);
    await expect(
      h.repo.listReleasedObservations(CITIZEN_OVERLAY_IDS.pendingPatient),
    ).rejects.toMatchObject({
      code: "FORBIDDEN",
      reason: "CONSENT_REQUIRED",
    });
    await h.repo.recordConsent(
      {
        patientId: CITIZEN_OVERLAY_IDS.pendingPatient,
        action: "granted",
        noticeVersion: "demo-notice-v0.1",
      },
      h.key(),
    );
    expect((await h.repo.getConsent(CITIZEN_OVERLAY_IDS.pendingPatient)).state).toBe("granted");
    expect(await h.repo.listReleasedObservations(CITIZEN_OVERLAY_IDS.pendingPatient)).toEqual([]);
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

describe.each(adapters)("CitizenRepository CTZ-05 reminders (%s adapter)", (_name, makeStore) => {
  const DAY = 86_400_000;
  const APPOINTMENT = SEED_ANCHORS.CTZ_P1_APPOINTMENT_INSTRUCTION.careInstructionId;
  const prefsOf = async (h: Awaited<ReturnType<typeof setup>>) =>
    (await h.repo.getNotificationPrefs(P1))!;
  /** Audits written by this test (seed history is older than the pinned demo clock). */
  const audits = async (h: Awaited<ReturnType<typeof setup>>, action: string) =>
    (await h.audits(action))
      .filter((e) => e.occurredAt >= "2026-10-14T06:00:00.000Z")
      .map((e) => ({ ...e, changeSummary: (e.changeSummary ?? {}) as Record<string, unknown> }));
  const scheduledOf = async (h: Awaited<ReturnType<typeof setup>>) =>
    (await h.repo.listReminders(P1)).filter((r) => r.status === "scheduled");

  it("seed: CTZ-P1 opted in with 1 scheduled + 2 history rows (1 seen)", async () => {
    const h = await setup(makeStore());
    expect(await prefsOf(h)).toMatchObject({ optedIn: true, timing: "day_before" });
    const rows = await h.repo.listReminders(P1);
    expect(rows.filter((r) => r.status === "scheduled")).toHaveLength(1);
    expect(rows.filter((r) => r.status !== "scheduled")).toHaveLength(2);
    expect(rows.filter((r) => r.status === "acknowledged")).toHaveLength(1);
  });

  it("opt out: every scheduled row cancelled + one reminder.cancelled each; clock advance delivers nothing", async () => {
    const h = await setup(makeStore());
    const prefs = await prefsOf(h);
    const before = await scheduledOf(h);
    await h.repo.updateNotificationPrefs(
      { patientId: P1, expectedVersion: prefs.version, optedIn: false, timing: prefs.timing },
      h.key(),
    );
    expect(await scheduledOf(h)).toHaveLength(0);
    const cancelled = await audits(h, "reminder.cancelled");
    expect(cancelled).toHaveLength(before.length);
    expect(cancelled.every((e) => e.changeSummary["reason"] === "opted_out")).toBe(true);
    const changed = await audits(h, "reminder.preference_changed");
    expect(changed.at(-1)?.changeSummary).toMatchObject({ change: "opted_out", optedIn: false });

    const total = (await h.repo.listReminders(P1)).length;
    await h.repo.demo.advanceClock(7 * DAY);
    const result = await h.repo.processDueReminders(P1);
    expect(result.delivered).toHaveLength(0);
    const after = await h.repo.listReminders(P1);
    expect(after).toHaveLength(total);
    expect(after.some((r) => r.status === "scheduled")).toBe(false);
    expect(await audits(h, "reminder.delivered_simulated")).toHaveLength(0);
  });

  it("opt in with morning_of: exactly one reminder per future approved appointment; replay / repeat never duplicate", async () => {
    const h = await setup(makeStore());
    let prefs = await prefsOf(h);
    await h.repo.updateNotificationPrefs(
      { patientId: P1, expectedVersion: prefs.version, optedIn: false, timing: "day_before" },
      h.key(),
    );
    prefs = await prefsOf(h);
    const key = h.key();
    const input = {
      patientId: P1,
      expectedVersion: prefs.version,
      optedIn: true,
      timing: "morning_of" as const,
    };
    const first = await h.repo.updateNotificationPrefs(input, key);
    const scheduled = await scheduledOf(h);
    expect(scheduled).toHaveLength(1);
    expect(scheduled[0]).toMatchObject({
      instructionId: APPOINTMENT,
      // Appointment 19 Oct 10:30 Kigali → 07:00 Kigali the same day.
      scheduledAt: "2026-10-19T05:00:00.000Z",
      consentBasis: "citizen_opt_in",
    });
    const replay = await h.repo.updateNotificationPrefs(input, key);
    expect(replay.replayed).toBe(true);
    expect(replay.data).toEqual(first.data);
    expect(await scheduledOf(h)).toHaveLength(1);
    // Same choice again with a new key: still one row.
    await h.repo.updateNotificationPrefs(
      { ...input, expectedVersion: first.data.version },
      h.key(),
    );
    expect(await scheduledOf(h)).toHaveLength(1);
    const scheduledAudits = await audits(h, "reminder.scheduled");
    expect(scheduledAudits).toHaveLength(1);
    expect(scheduledAudits[0]).toMatchObject({ actorId: null });
    expect(scheduledAudits[0]?.changeSummary["systemActor"]).toBe("wallet-scheduler");
    expect(
      (await audits(h, "reminder.preference_changed")).map((e) => e.changeSummary["change"]),
    ).toEqual(["opted_out", "opted_in", "unchanged"]);
  });

  it("timing change replaces the scheduled row (timing_changed)", async () => {
    const h = await setup(makeStore());
    const prefs = await prefsOf(h);
    const [seeded] = await scheduledOf(h);
    await h.repo.updateNotificationPrefs(
      { patientId: P1, expectedVersion: prefs.version, optedIn: true, timing: "morning_of" },
      h.key(),
    );
    const rows = await h.repo.listReminders(P1);
    expect(rows.find((r) => r.id === seeded!.id)).toMatchObject({
      status: "cancelled",
      cancelReason: "timing_changed",
    });
    expect((await scheduledOf(h)).map((r) => r.scheduledAt)).toEqual(["2026-10-19T05:00:00.000Z"]);
  });

  it("clock past scheduledAt → delivered_simulated; Got it → acknowledged; next step stays planned", async () => {
    const h = await setup(makeStore());
    const [row] = await scheduledOf(h);
    expect((await h.repo.processDueReminders(P1)).delivered).toHaveLength(0);
    await h.repo.demo.advanceClock(5 * DAY);
    const { delivered } = await h.repo.processDueReminders(P1);
    expect(delivered.map((r) => r.id)).toEqual([row!.id]);
    expect(delivered[0]).toMatchObject({ status: "delivered_simulated" });
    expect(delivered[0]?.deliveredAt).toBeTruthy();
    // Idempotent.
    expect((await h.repo.processDueReminders(P1)).delivered).toHaveLength(0);
    expect(await audits(h, "reminder.delivered_simulated")).toHaveLength(1);

    const key = h.key();
    const ack = await h.repo.acknowledgeReminder({ patientId: P1, reminderId: row!.id }, key);
    expect(ack.data).toMatchObject({ status: "acknowledged" });
    expect(
      (await h.repo.acknowledgeReminder({ patientId: P1, reminderId: row!.id }, key)).replayed,
    ).toBe(true);
    const again = await h.repo.acknowledgeReminder({ patientId: P1, reminderId: row!.id }, h.key());
    expect(again.data).toEqual(ack.data);
    expect(await audits(h, "reminder.acknowledged")).toHaveLength(1);
    const step = (await h.repo.listApprovedInstructions(P1)).find((s) => s.id === APPOINTMENT);
    expect(step).toMatchObject({ progress: "planned", completion: null });
  });

  it("acknowledging a scheduled reminder is an invalid transition; another patient's is denied", async () => {
    const h = await setup(makeStore());
    const [row] = await scheduledOf(h);
    await expect(
      h.repo.acknowledgeReminder({ patientId: P1, reminderId: row!.id }, h.key()),
    ).rejects.toMatchObject({ code: "VALIDATION_ERROR", reason: "INVALID_TRANSITION" });
    h.as(PERSONA_IDS.citizen2);
    await forbidden(
      h.repo.acknowledgeReminder({ patientId: P2, reminderId: row!.id }, h.key()),
      "SCOPE",
    );
  });

  it("conflict-next-write on the patient → CONFLICT, nothing changed (T-05)", async () => {
    const h = await setup(makeStore());
    const prefs = await prefsOf(h);
    const before = await h.repo.listReminders(P1);
    await h.repo.demo.setFaults({ conflictOnce: [{ entityType: "patient", entityId: P1 }] });
    await expect(
      h.repo.updateNotificationPrefs(
        { patientId: P1, expectedVersion: prefs.version, optedIn: false, timing: prefs.timing },
        h.key(),
      ),
    ).rejects.toMatchObject({ code: "CONFLICT" });
    expect(await prefsOf(h)).toEqual(prefs);
    expect(await h.repo.listReminders(P1)).toEqual(before);
  });

  it("consent withdrawal cancels scheduled reminders with audits; prefs untouched; re-consent does not re-plan", async () => {
    const h = await setup(makeStore());
    const prefs = await prefsOf(h);
    await h.repo.recordConsent({ patientId: P1, action: "withdrawn" }, h.key());
    const cancelled = await audits(h, "reminder.cancelled");
    expect(cancelled).toHaveLength(1);
    expect(cancelled[0]?.changeSummary["reason"]).toBe("consent_withdrawn");
    await h.repo.recordConsent({ patientId: P1, action: "granted" }, h.key());
    expect(await prefsOf(h)).toEqual(prefs);
    expect(await scheduledOf(h)).toHaveLength(0);
  });

  it("preview sent is audited", async () => {
    const h = await setup(makeStore());
    await h.repo.recordReminderPreviewSent(P1);
    expect(await h.audits("citizen.reminder.preview_sent")).toHaveLength(1);
  });
});

describe.each(adapters)(
  "CitizenRepository CTZ-07 privacy and corrections (%s adapter)",
  (_name, makeStore) => {
    const AMENDED = CITIZEN_OVERLAY_IDS.amendedScreening;
    type Task = {
      id: string;
      kind: string;
      status: string;
      patientId: string;
      payload: Record<string, unknown>;
    };
    const tasksOf = async (h: Awaited<ReturnType<typeof setup>>) =>
      (await h.store.getAll<Task>("careTasks")).filter(
        (t) => t.kind === "correction_request" && t.payload["requestStatus"] === "submitted",
      );
    /** Hash of everything a correction request must never touch (FRD §4, T-06). */
    const recordHash = async (h: Awaited<ReturnType<typeof setup>>) =>
      hashCanonical({
        screenings: await h.store.getAll("screenings"),
        careInstructions: await h.store.getAll("careInstructions"),
        patients: await h.store.getAll("patients"),
        citizenAccounts: await h.store.getAll("citizenAccounts"),
      });
    const request = (overrides: Record<string, unknown> = {}) => ({
      patientId: P1,
      targetType: "screening" as const,
      targetId: AMENDED,
      description: "The time of this check looks wrong to me.",
      ...overrides,
    });
    const latestTarget = async (h: Awaited<ReturnType<typeof setup>>, id: string) =>
      (await h.repo.listCorrectionTargets(P1)).find((t) => t.targetId === id)!;

    it("valid request: one task (submitted, clinician), two audits sharing a correlation; record hash unchanged", async () => {
      const h = await setup(makeStore());
      const before = await recordHash(h);
      const target = await latestTarget(h, AMENDED);
      const result = await h.repo.createCorrectionRequest(
        request({ expectedTargetVersion: target.version, suggestedValue: "Fasting" }),
        h.key(),
      );
      expect(result.data).toMatchObject({
        kind: "correction_request",
        status: "open",
        payload: { requestStatus: "submitted", assignedRole: "clinician", targetId: AMENDED },
      });
      expect(await tasksOf(h)).toHaveLength(1);
      const requested = (await h.audits("correction.requested")).filter(
        (e) => e.entityId === result.data.id,
      );
      const created = (await h.audits("task.created")).filter((e) => e.entityId === result.data.id);
      expect(requested).toHaveLength(1);
      expect(created).toHaveLength(1);
      expect(requested[0]?.correlationId).toBe(created[0]?.correlationId);
      expect(await recordHash(h)).toBe(before);
      const listed = await h.repo.listCorrectionRequests(P1);
      expect(listed.find((r) => r.id === result.data.id)).toMatchObject({
        status: "submitted",
        suggestedText: "Fasting",
        resolutionKey: null,
      });
    });

    it("same key = replay (one task); other key while open = DUPLICATE_OPEN_REQUEST + audit", async () => {
      const h = await setup(makeStore());
      const key = h.key();
      const first = await h.repo.createCorrectionRequest(request(), key);
      const replay = await h.repo.createCorrectionRequest(request(), key);
      expect(replay.replayed).toBe(true);
      expect(replay.data.id).toBe(first.data.id);
      const error = await h.repo.createCorrectionRequest(request(), h.key()).then(
        () => null,
        (e: unknown) => e,
      );
      expect(error).toMatchObject({
        code: "VALIDATION_ERROR",
        reason: "DUPLICATE_OPEN_REQUEST",
        details: { existingId: first.data.id, existingCreatedAt: first.data.createdAt },
      });
      expect(await tasksOf(h)).toHaveLength(1);
      const blocked = await h.audits("citizen.correction.duplicate_blocked");
      expect(blocked).toHaveLength(1);
      expect(blocked[0]).toMatchObject({ entityId: first.data.id, outcome: "denied" });
      // A different item is fine.
      await h.repo.createCorrectionRequest(
        request({ targetType: "patient", targetId: P1, description: "My birth year is wrong." }),
        h.key(),
      );
      expect(await tasksOf(h)).toHaveLength(2);
    });

    it("conflict toggle or a stale target version → CONFLICT, nothing written (T-05)", async () => {
      const h = await setup(makeStore());
      await h.repo.demo.setFaults({ conflictOnce: [{ entityType: "patient", entityId: P1 }] });
      await expect(h.repo.createCorrectionRequest(request(), h.key())).rejects.toMatchObject({
        code: "CONFLICT",
      });
      const target = await latestTarget(h, AMENDED);
      await expect(
        h.repo.createCorrectionRequest(
          request({ expectedTargetVersion: target.version - 1 }),
          h.key(),
        ),
      ).rejects.toMatchObject({ code: "CONFLICT" });
      expect(await tasksOf(h)).toHaveLength(0);
      expect(await h.audits("conflict.detected")).toHaveLength(2);
      // The toggle is consumed once: the next send goes through.
      await h.repo.createCorrectionRequest(request(), h.key());
      expect(await tasksOf(h)).toHaveLength(1);
    });

    it("targets: released results, approved steps, personal details; representative only Grace's", async () => {
      const h = await setup(makeStore());
      const targets = await h.repo.listCorrectionTargets(P1);
      expect(targets.at(-1)).toMatchObject({ targetType: "patient", targetId: P1 });
      expect(targets.some((t) => t.targetType === "screening" && t.targetId === AMENDED)).toBe(
        true,
      );
      expect(targets.some((t) => t.targetType === "care_instruction")).toBe(true);
      for (const t of targets) {
        if (t.targetType === "screening") expect(t.observation.kind).toBe("released");
      }
      h.as(PERSONA_IDS.citizenRep);
      const grace = await h.repo.listCorrectionTargets(P4);
      expect(
        grace.every(
          (t) => t.targetId === P4 || ("observation" in t ? t.observation.patientId === P4 : true),
        ),
      ).toBe(true);
      await forbidden(h.repo.listCorrectionTargets(P1), "SCOPE");
      await expect(
        h.repo.createCorrectionRequest(request({ patientId: P4 }), h.key()),
      ).rejects.toMatchObject({ code: "VALIDATION_ERROR" });
      await forbidden(h.repo.createCorrectionRequest(request(), h.key()), "SCOPE");
    });

    it("seeded resolved requests carry their outcome key; detail logs citizen.correction.viewed", async () => {
      const h = await setup(makeStore());
      const amended = await h.repo.getCorrectionRequest(
        CITIZEN_OVERLAY_IDS.resolvedAmendedCorrection,
        P1,
      );
      expect(amended).toMatchObject({
        status: "resolved_amended",
        resolutionKey: "glucose_context_corrected",
        targetId: AMENDED,
      });
      await h.repo.getCorrectionRequest(CITIZEN_OVERLAY_IDS.resolvedAmendedCorrection, P1);
      expect(await h.audits("citizen.correction.viewed")).toHaveLength(1); // de-duplicated
      await forbidden(
        h.repo.getCorrectionRequest(CITIZEN_OVERLAY_IDS.resolvedNoChangeCorrection, P1),
        "SCOPE",
      );
      await expect(h.repo.getCorrectionRequest("nope", P1)).rejects.toMatchObject({
        code: "NOT_FOUND",
      });
      h.as(PERSONA_IDS.citizen2);
      expect(
        await h.repo.getCorrectionRequest(CITIZEN_OVERLAY_IDS.resolvedNoChangeCorrection, P2),
      ).toMatchObject({ status: "resolved_no_change", resolutionKey: "reading_time_confirmed" });
    });

    it("access history: staff + own, newest first, no system rows, no free text; views audited", async () => {
      const h = await setup(makeStore());
      type Row = { id: string } & Record<string, unknown>;
      await h.store.put<Row>("accessEvents", {
        ...(await h.store.getAll<Row>("accessEvents"))[0],
        id: "system-row",
        patientId: P1,
        actorId: null,
        actorRole: null,
      });
      const first = (await h.store.getAll<Row>("accessEvents")).find(
        (e) => e["patientId"] === P1 && e["actorId"] !== null,
      )!;
      await h.store.put<Row>("accessEvents", {
        ...first,
        justification: "Clinician free text",
        changeSummary: { note: "x" },
      });
      const events = await h.repo.listAccessEvents(P1);
      expect(events.length).toBeGreaterThan(0);
      expect(events.some((e) => e.id === "system-row")).toBe(false);
      expect(events.every((e) => e.justification === null)).toBe(true);
      expect(events.every((e) => JSON.stringify(e.changeSummary) === "{}")).toBe(true);
      expect(events.some((e) => e.actorRole === "citizen")).toBe(true);
      expect(events.some((e) => e.actorRole !== "citizen")).toBe(true);
      const times = events.map((e) => e.occurredAt);
      expect([...times].sort().reverse()).toEqual(times);
      await h.repo.recordAccessHistoryViewed(P1);
      await h.repo.recordPrivacyNoticeViewed("demo-notice-v0.1");
      expect(await h.audits("citizen.access_history.viewed")).toHaveLength(1);
      expect(await h.audits("citizen.privacy_notice.viewed")).toHaveLength(1);
      // CTZ-08: Support / Help views are persona-level audits (no consent needed).
      await h.repo.recordSupportViewed();
      await h.repo.recordHelpViewed();
      expect(await h.audits("citizen.support.viewed")).toHaveLength(1);
      expect(await h.audits("citizen.help.viewed")).toHaveLength(1);
    });
  },
);
