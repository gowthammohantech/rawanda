/**
 * `createCitizenRepository(deps)` (CTZ-01) — the wallet facade over the FND-07 engine (one
 * `StoreAdapter`: SQLite on device, Dexie on the Expo web target, memory in tests), the shared
 * demo API and the simulated transport (`FaultConfig`: CTZ toggles `error500` →
 * `serverErrorRate`, `unavailable` → `dependencyUnavailableRate`, `conflict-next-write` →
 * `conflictOnce`). Audit entity types reuse the FND `EntityType`s of the affected resource:
 * consent → `patient`, acknowledgement → `care_instruction`, settings / session → `persona`.
 */
import {
  AcknowledgeInstructionInputSchema,
  AcknowledgeReminderInputSchema,
  CallbackRequestInputSchema,
  CorrectionRequestInputSchema,
  RecordConsentInputSchema,
  UpdateCitizenSettingsInputSchema,
  UpdateNotificationPrefsInputSchema,
  VerifyIdentityInputSchema,
  MAX_VERIFICATION_ATTEMPTS,
  type CitizenAccessEvent,
  type CitizenAccount,
  type CitizenCareTask,
  type CitizenSettings,
  type ConsentRecord,
  type CorrectionRequest,
  type IdentityVerification,
  type NextStepAcknowledgement,
  type PatientLink,
  type TimelineItem,
} from "@laif/contracts";
import {
  asId,
  planReminders,
  processDueReminders,
  REMINDABLE_INSTRUCTION_KINDS,
  reminderKey,
  selectApprovedInstructions,
  selectReleasedObservations,
  type CareInstruction,
  type CareTask,
  type CareTaskId,
  type ConsentState,
  type CorrectionRequestStatus,
  type CorrelationId,
  type DemoPersona,
  type FollowUp,
  type Patient,
  type PatientId,
  type Referral,
  type Reminder,
  type ReminderCancelReason,
  type ReminderId,
  type ReminderPreference,
  type Review,
  type Screening,
} from "@laif/domain";
import { CITIZEN_PERSONA_CODES, createSeed, PERSONA_IDS, type SeedDataset } from "@laif/mock-data";

import type { AuditAction } from "../audit/actions.ts";
import type { RepositoryDeps } from "../care-repository.ts";
import { defer, Engine, type TxContext } from "../core/engine.ts";
import { RepositoryError } from "../errors.ts";
import { applyClockOffset, createDemoApi, META_KEYS } from "../services/demo.ts";
import { createFaultInjector, FAULTS_META_KEY } from "../transport/faults.ts";
import { realSleep, simulateTransport, withSimulatedTransport } from "../transport/simulated.ts";
import type {
  CitizenDemoApi,
  CitizenLinkedPatient,
  CitizenPersonaSummary,
  CitizenRepository,
  CitizenRepositoryDeps,
  CitizenSession,
  CorrectionTarget,
} from "./CitizenRepository.ts";

const byIdAsc = (a: { id: string }, b: { id: string }) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
const desc =
  <T extends { id: string }>(key: (x: T) => string) =>
  (a: T, b: T) =>
    key(a) < key(b) ? 1 : key(a) > key(b) ? -1 : byIdAsc(a, b);

/** Current consent of a patient = the latest append-only record (else `not_recorded`). */
export function currentConsent(records: readonly ConsentRecord[]): ConsentRecord | null {
  let latest: ConsentRecord | null = null;
  for (const r of records) {
    if (
      latest === null ||
      r.recordedAt > latest.recordedAt ||
      (r.recordedAt === latest.recordedAt && r.createdAt > latest.createdAt)
    ) {
      latest = r;
    }
  }
  return latest;
}

/** Citizen-visible request state of a correction task (payload wins, else from task status). */
export function correctionStatusOf(task: CareTask): CorrectionRequestStatus {
  if (task.kind === "correction_request" && task.payload.requestStatus) {
    return task.payload.requestStatus;
  }
  switch (task.status) {
    case "open":
      return "submitted";
    case "in_progress":
      return "in_review";
    default:
      return "resolved_no_change";
  }
}

export function createCitizenRepository(input: CitizenRepositoryDeps): CitizenRepository {
  const deps: RepositoryDeps = { ...input, appId: "citizen", sync: false };
  const faults = deps.faults ?? createFaultInjector(deps.faultSeed);
  const sleep = deps.sleep ?? realSleep;
  let seedCache: SeedDataset | null = null;
  const seed = (): SeedDataset => {
    seedCache ??= (deps.seed ?? createSeed)();
    return structuredClone(seedCache);
  };

  const engine = new Engine({
    deps,
    store: deps.store,
    mode: "direct",
    faults,
    init: () =>
      deps.store.transaction(async (tx) => {
        faults.load(await tx.getMeta(FAULTS_META_KEY));
        applyClockOffset(
          deps.clock as Parameters<typeof applyClockOffset>[0],
          Number((await tx.getMeta(META_KEYS.clockOffsetMs)) ?? "0") || 0,
        );
      }),
  });

  // ── Shared checks ─────────────────────────────────────────────────────────

  /** The signed-in citizen (role check `self.read`, audited on denial). */
  function citizenActor(ctx: TxContext, entityId: string) {
    ctx.authorize("self.read", undefined, { entityType: "persona", entityId });
    return ctx.requireActor();
  }

  async function linksOf(ctx: TxContext, personaId: string): Promise<PatientLink[]> {
    return (await ctx.tx.getAll<PatientLink>("patientLinks"))
      .filter((l) => l.personaId === personaId && l.status === "active")
      .sort(byIdAsc);
  }

  async function consentRecordsOf(ctx: TxContext, patientId: string): Promise<ConsentRecord[]> {
    return (await ctx.tx.getAll<ConsentRecord>("consentRecords"))
      .filter((c) => c.patientId === patientId)
      .sort((a, b) =>
        a.recordedAt < b.recordedAt ? -1 : a.recordedAt > b.recordedAt ? 1 : byIdAsc(a, b),
      );
  }

  async function consentStateOf(ctx: TxContext, patientId: string): Promise<ConsentState> {
    return currentConsent(await consentRecordsOf(ctx, patientId))?.action ?? "not_recorded";
  }

  /**
   * Link (always) + consent (unless `consent: false`) for one patient. Denials → `FORBIDDEN`
   * `SCOPE` / `CONSENT_REQUIRED` + one `access.denied`.
   */
  async function assertPatientAccess(
    ctx: TxContext,
    patientId: string,
    options: { consent?: boolean } = {},
  ): Promise<{ link: PatientLink; patient: Patient }> {
    const actor = citizenActor(ctx, patientId);
    const target = { entityType: "patient" as const, entityId: patientId };
    const resource = { patientId: asId<PatientId>(patientId) };
    const link = (await linksOf(ctx, actor.personaId)).find((l) => l.patientId === patientId);
    if (!link) ctx.deny("SCOPE", target, resource);
    const patient = await ctx.find<Patient>("patient", patientId);
    if (!patient) ctx.deny("SCOPE", target, resource);
    if (options.consent !== false && (await consentStateOf(ctx, patientId)) !== "granted") {
      ctx.deny("CONSENT_REQUIRED", target, {
        patientId: patient.id,
        facilityId: patient.facilityId,
      });
    }
    return { link, patient };
  }

  async function observationsOf(ctx: TxContext, patientId: string) {
    return selectReleasedObservations({
      patientId,
      screenings: await ctx.all<Screening>("screening"),
      reviews: await ctx.all<Review>("review"),
    });
  }

  async function instructionsOf(ctx: TxContext, patientId: string) {
    const acks = (await ctx.tx.getAll<NextStepAcknowledgement>("nextStepAcks")).filter(
      (a) => a.patientId === patientId,
    );
    return selectApprovedInstructions({
      patientId,
      instructions: await ctx.all<CareInstruction>("care_instruction"),
      referrals: await ctx.all<Referral>("referral"),
      followUps: await ctx.all<FollowUp>("follow_up"),
      acks,
      now: ctx.now,
    });
  }

  // ── Reminders (CTZ-05) ────────────────────────────────────────────────────

  /** System actor of simulated scheduling / delivery (audit `changeSummary.systemActor`). */
  const SCHEDULER = "wallet-scheduler";
  const systemActor = { actorId: null, actorRole: null };

  async function remindersOf(ctx: TxContext, patientId: string): Promise<Reminder[]> {
    return (await ctx.all<Reminder>("reminder"))
      .filter((r) => r.patientId === patientId)
      .sort((a, b) =>
        a.scheduledAt < b.scheduledAt ? -1 : a.scheduledAt > b.scheduledAt ? 1 : byIdAsc(a, b),
      );
  }

  async function prefsOf(ctx: TxContext, patientId: string): Promise<ReminderPreference | null> {
    return (
      (await ctx.all<ReminderPreference>("reminder_preference")).find(
        (p) => p.patientId === patientId,
      ) ?? null
    );
  }

  /** `scheduled → cancelled(reason)` + one `reminder.cancelled` audit. */
  async function cancelReminder(
    ctx: TxContext,
    patient: Patient,
    reminder: Reminder,
    reason: ReminderCancelReason,
  ): Promise<Reminder> {
    const next = ctx.touch(reminder, { status: "cancelled", cancelReason: reason });
    await ctx.save("reminder", next);
    await ctx.audit({
      action: "reminder.cancelled",
      entityType: "reminder",
      entityId: reminder.id,
      before: reminder,
      after: next,
      patientId: patient.id,
      facilityId: patient.facilityId,
      changeSummary: { reason, instructionId: reminder.instructionId },
    });
    return next;
  }

  /** Cancels every `scheduled` reminder of the patient (opt-out / consent withdrawal). */
  async function cancelAllScheduled(
    ctx: TxContext,
    patient: Patient,
    reason: ReminderCancelReason,
  ): Promise<number> {
    let cancelled = 0;
    for (const reminder of await remindersOf(ctx, patient.id)) {
      if (reminder.status !== "scheduled") continue;
      await cancelReminder(ctx, patient, reminder, reason);
      cancelled += 1;
    }
    return cancelled;
  }

  /**
   * Brings the stored schedule in line with `planReminders` (opted in): scheduled rows that are
   * not in the plan are cancelled (`timing_changed`, or `instruction_cancelled` when the step no
   * longer gets reminders); missing plan rows are inserted (unique `(instructionId,
   * scheduledAt)` among non-cancelled rows, so a repeat never duplicates).
   */
  async function replanReminders(
    ctx: TxContext,
    patient: Patient,
    prefs: ReminderPreference,
  ): Promise<{ cancelled: number; scheduled: number }> {
    const plans = planReminders(await instructionsOf(ctx, patient.id), prefs, {
      now: () => ctx.now,
    });
    const planned = new Set(plans.map((p) => p.key));
    const plannedSteps = new Set(plans.map((p) => p.instructionId));
    const rows = await remindersOf(ctx, patient.id);
    let cancelled = 0;
    for (const row of rows) {
      if (
        row.status !== "scheduled" ||
        planned.has(reminderKey(row.instructionId, row.scheduledAt))
      )
        continue;
      const reason = plannedSteps.has(row.instructionId)
        ? "timing_changed"
        : "instruction_cancelled";
      await cancelReminder(ctx, patient, row, reason);
      cancelled += 1;
    }
    const existing = new Set(
      rows
        .filter((r) => r.status !== "cancelled")
        .map((r) => reminderKey(r.instructionId, r.scheduledAt)),
    );
    let scheduled = 0;
    for (const plan of plans) {
      if (existing.has(plan.key)) continue;
      const reminder: Reminder = {
        ...ctx.created(),
        id: asId<ReminderId>(ctx.ids()),
        patientId: patient.id,
        followUpId: plan.followUpId as Reminder["followUpId"],
        channel: prefs.channel,
        consentBasis: "citizen_opt_in",
        scheduledAt: plan.scheduledAt,
        status: "scheduled",
        instructionId: plan.instructionId as Reminder["instructionId"],
        cancelReason: null,
        deliveredAt: null,
        acknowledgedAt: null,
      };
      await ctx.save("reminder", reminder);
      await ctx.audit({
        action: "reminder.scheduled",
        entityType: "reminder",
        entityId: reminder.id,
        after: reminder,
        patientId: patient.id,
        facilityId: patient.facilityId,
        actor: systemActor,
        changeSummary: {
          systemActor: SCHEDULER,
          instructionId: plan.instructionId,
          scheduledAt: plan.scheduledAt,
          timing: plan.timing,
        },
      });
      scheduled += 1;
    }
    return { cancelled, scheduled };
  }

  async function linkedPatients(
    ctx: TxContext,
    links: readonly PatientLink[],
  ): Promise<CitizenLinkedPatient[]> {
    const out: CitizenLinkedPatient[] = [];
    for (const link of links) {
      const patient = await ctx.find<Patient>("patient", link.patientId);
      out.push({
        patientId: link.patientId,
        displayName: patient?.displayName ?? "",
        relationship: link.relationship,
        consentState: await consentStateOf(ctx, link.patientId),
        facilityId: patient?.facilityId ?? null,
      });
    }
    return out;
  }

  async function sessionOf(ctx: TxContext, persona: DemoPersona): Promise<CitizenSession> {
    const accounts = await ctx.tx.getAll<CitizenAccount>("citizenAccounts");
    const verifications = await ctx.tx.getAll<IdentityVerification>("identityVerifications");
    const links = await linksOf(ctx, persona.id);
    const patients = await linkedPatients(ctx, links);
    return {
      personaId: persona.id,
      displayName: persona.displayName,
      account: accounts.find((a) => a.personaId === persona.id) ?? null,
      verification: verifications.find((v) => v.personaId === persona.id) ?? null,
      links,
      patients,
      activePatientId: links[0]?.patientId ?? null,
    };
  }

  /** Own-view access event + audit, de-duplicated per persona + resource per demo minute. */
  async function recordOwnView(
    ctx: TxContext,
    patient: Patient,
    link: PatientLink,
    resource: { type: CitizenAccessEvent["resourceType"]; id: string },
    kind: { action: CitizenAccessEvent["action"]; audit: AuditAction; dedupe: boolean } = {
      action: "result_viewed",
      audit: "citizen.result.viewed",
      dedupe: true,
    },
  ): Promise<void> {
    const actor = ctx.requireActor();
    if (kind.dedupe) {
      const minute = String(Math.floor(ctx.now.getTime() / 60_000));
      const metaKey = `ctz.access.${actor.personaId}.${resource.id}`;
      if ((await ctx.tx.getMeta(metaKey)) === minute) return;
      await ctx.tx.setMeta(metaKey, minute);
    }
    const correlationId = asId<CorrelationId>(ctx.ids());
    const event: CitizenAccessEvent = {
      ...ctx.created(),
      id: ctx.ids(),
      patientId: patient.id,
      actorId: actor.personaId,
      actorRole: actor.role,
      action: kind.action,
      purpose: link.relationship === "self" ? "self_access" : "representative_access",
      resourceType: resource.type,
      resourceId: resource.id,
      occurredAt: ctx.nowIso,
      facilityId: patient.facilityId,
      correlationId,
      changeSummary: {},
      justification: null,
    };
    await ctx.tx.put("accessEvents", event);
    await ctx.audit({
      action: kind.audit,
      entityType: resource.type,
      entityId: resource.id,
      correlationId,
      patientId: patient.id,
      facilityId: patient.facilityId,
      changeSummary: { accessEventId: event.id },
    });
  }

  async function citizenTasks(ctx: TxContext, patientId: string): Promise<CareTask[]> {
    return (await ctx.all<CareTask>("care_task")).filter(
      (t) =>
        t.patientId === patientId &&
        (t.kind === "correction_request" || t.kind === "callback_request"),
    );
  }

  function toCorrection(task: CareTask & { kind: "correction_request" }): CorrectionRequest {
    const status = correctionStatusOf(task);
    return {
      id: task.id,
      patientId: task.patientId as PatientId,
      targetType: task.payload.targetType,
      targetId: task.payload.targetId,
      description: task.payload.description,
      status,
      createdBy: task.createdBy,
      resolvedAt: status.startsWith("resolved") ? (task.completedAt ?? task.updatedAt) : null,
      suggestedText:
        typeof task.payload.suggestedValue === "string" && task.payload.suggestedValue !== ""
          ? task.payload.suggestedValue
          : null,
      resolutionKey: status.startsWith("resolved") ? (task.payload.resolutionKey ?? null) : null,
      version: task.version,
      createdAt: task.createdAt,
      updatedAt: task.updatedAt,
      synthetic: true,
    };
  }

  /** Open = still with the care team (a second request for the same item is blocked). */
  const isOpenCorrection = (status: CorrectionRequestStatus) =>
    status === "submitted" || status === "in_review";

  /** CTZ-07 picker items: released results, approved next steps, then personal details. */
  async function correctionTargetsOf(
    ctx: TxContext,
    patient: Patient,
  ): Promise<CorrectionTarget[]> {
    const out: CorrectionTarget[] = [];
    for (const o of await observationsOf(ctx, patient.id)) {
      if (o.kind !== "released") continue;
      const stored = await ctx.find<Screening>("screening", o.id);
      out.push({
        targetType: "screening",
        targetId: o.id,
        version: stored?.version ?? 1,
        observation: o,
      });
    }
    for (const c of await instructionsOf(ctx, patient.id)) {
      out.push({
        targetType: "care_instruction",
        targetId: c.id,
        version: c.version,
        instruction: c,
      });
    }
    out.push({
      targetType: "patient",
      targetId: patient.id,
      version: patient.version,
      displayName: patient.displayName,
      dateOfBirth: patient.dateOfBirth,
    });
    return out;
  }

  // ── Repository ────────────────────────────────────────────────────────────

  // ── Demo tools (CTZ-09 task 10) ────────────────────────────────────────────

  /** The simulated Clinical Portal actor of the seeded "care team confirms attendance" step. */
  const SIMULATED_CLINICIAN = PERSONA_IDS.clinAlpha1;
  const SIMULATED_EVIDENCE = "clinician_confirmation" as const;

  /**
   * DEMO ONLY — represents an action in the Clinical Portal (isolated wallet, D3): completes the
   * linked referral / follow-up of a planned approved step with `clinician_confirmation`
   * evidence as the simulated clinician; the step's progress is derived from it.
   */
  const simulateCareTeamConfirmation: CitizenDemoApi["simulateCareTeamConfirmation"] = async ({
    patientId,
    instructionId,
  }) => {
    await engine.ready();
    return engine.write(async (ctx) => {
      const { patient } = await assertPatientAccess(ctx, patientId);
      const planned = (await instructionsOf(ctx, patientId))
        .filter(
          (step) =>
            step.progress === "planned" &&
            (step.sourceType === "referral" || step.sourceType === "follow_up"),
        )
        .sort((a, b) => {
          const at = (x: typeof a) => x.appointmentAt ?? "9999";
          return at(a) < at(b) ? -1 : at(a) > at(b) ? 1 : byIdAsc(a, b);
        });
      const step =
        instructionId === undefined
          ? planned[0]
          : planned.find((candidate) => candidate.id === instructionId);
      if (step === undefined) {
        throw new RepositoryError("VALIDATION_ERROR", {
          reason: "INVALID_TRANSITION",
          details: { instructionId: instructionId ?? null, expected: "planned approved step" },
        });
      }
      const persona = await ctx.tx.get<{ id: string; role: string }>(
        "personas",
        SIMULATED_CLINICIAN,
      );
      const actor = {
        actorId: SIMULATED_CLINICIAN as never,
        actorRole: (persona?.role ?? "clinician") as never,
      };
      const note = "Simulated care-team confirmation (demo).";
      let sourceType: "referral" | "follow_up";
      let before: Referral | FollowUp;
      let after: Referral | FollowUp;
      if (step.sourceType === "referral") {
        sourceType = "referral";
        const referral = await ctx.load<Referral>("referral", step.sourceId);
        before = referral;
        after = ctx.touch(referral, {
          status: "completed",
          completedAt: ctx.nowIso,
          completionEvidence: {
            type: SIMULATED_EVIDENCE,
            reference: "DEMO-SIM-CONF",
            outcome: "attended_seen",
            note,
            recordedBy: SIMULATED_CLINICIAN,
            recordedAt: ctx.nowIso,
          },
        });
        await ctx.save("referral", after);
      } else {
        sourceType = "follow_up";
        const followUp = await ctx.load<FollowUp>("follow_up", step.sourceId);
        before = followUp;
        after = ctx.touch(followUp, {
          status: "completed",
          completedAt: ctx.nowIso,
          outcome: {
            kind: "attended",
            occurredAt: ctx.nowIso,
            evidenceType: SIMULATED_EVIDENCE,
            reasonCode: null,
            note,
            recordedBy: SIMULATED_CLINICIAN,
          },
          clinicianConfirmation: { status: "confirmed", by: SIMULATED_CLINICIAN, at: ctx.nowIso },
        });
        await ctx.save("follow_up", after);
      }
      const event = await ctx.audit({
        action: "demo.simulated_staff_action",
        entityType: sourceType,
        entityId: step.sourceId,
        before,
        after,
        patientId: patient.id,
        facilityId: patient.facilityId,
        actor,
        changeSummary: {
          simulated: true,
          staffAction: "confirm_attendance",
          instructionId: step.id,
          evidenceType: SIMULATED_EVIDENCE,
          requestedBy: ctx.actor?.personaId ?? null,
        },
      });
      return {
        instructionId: step.id,
        sourceType,
        sourceId: step.sourceId,
        version: after.version,
        simulatedActorId: SIMULATED_CLINICIAN,
        auditEventId: event.id,
      };
    });
  };

  const repository: CitizenRepository = {
    listPersonas() {
      return engine.read(async (ctx) => {
        const personas = (await ctx.tx.getAll<DemoPersona & { citizenCode?: string }>("personas"))
          .filter((p) => p.role === "citizen")
          .sort(byIdAsc);
        const accounts = await ctx.tx.getAll<CitizenAccount>("citizenAccounts");
        const verifications = await ctx.tx.getAll<IdentityVerification>("identityVerifications");
        const out: CitizenPersonaSummary[] = [];
        for (const persona of personas) {
          const account = accounts.find((a) => a.personaId === persona.id) ?? null;
          out.push({
            personaId: persona.id,
            displayName: persona.displayName,
            citizenCode: CITIZEN_CODES[persona.id] ?? null,
            accountId: account?.id ?? null,
            accountStatus: account?.status ?? null,
            verificationStatus:
              verifications.find((v) => v.personaId === persona.id)?.status ?? null,
            patients: await linkedPatients(ctx, await linksOf(ctx, persona.id)),
          });
        }
        return out.sort((a, b) =>
          (a.citizenCode ?? a.personaId).localeCompare(b.citizenCode ?? b.personaId),
        );
      });
    },

    getSession() {
      return engine.read(async (ctx) => {
        if (!ctx.actor || ctx.actor.role !== "citizen") return null;
        const persona = await ctx.tx.get<DemoPersona>("personas", ctx.actor.personaId);
        return persona ? sessionOf(ctx, persona) : null;
      });
    },

    startSession(options = {}) {
      return engine.write(async (ctx) => {
        const actor = citizenActor(ctx, "session");
        const persona = await ctx.tx.get<DemoPersona>("personas", actor.personaId);
        if (!persona) {
          throw new RepositoryError("NOT_FOUND", { details: { personaId: actor.personaId } });
        }
        const session = await sessionOf(ctx, persona);
        await ctx.audit({
          action: "session.started",
          entityType: "persona",
          entityId: persona.id,
          correlationId: asId<CorrelationId>(ctx.ids()),
          changeSummary: { appId: "citizen", accountStatus: session.account?.status ?? null },
        });
        if (options.personaSelected === true) {
          await ctx.audit({
            action: "citizen.persona.selected",
            entityType: "persona",
            entityId: persona.id,
            correlationId: asId<CorrelationId>(ctx.ids()),
            changeSummary: { citizenCode: CITIZEN_CODES[persona.id] ?? null, demoOnly: true },
          });
        }
        return session;
      });
    },

    endSession() {
      return engine.write(async (ctx) => {
        if (!ctx.actor || ctx.actor.role !== "citizen") return null;
        const personaId = ctx.actor.personaId;
        await ctx.audit({
          action: "session.ended",
          entityType: "persona",
          entityId: personaId,
          correlationId: asId<CorrelationId>(ctx.ids()),
          changeSummary: { appId: "citizen" },
        });
        return { personaId };
      });
    },

    verifyIdentity(i, key) {
      return engine.mutate({
        op: "citizen.verifyIdentity",
        key,
        input: i,
        entityType: "persona",
        permission: "self.read",
        schema: VerifyIdentityInputSchema,
        run: async (ctx, input) => {
          const actor = citizenActor(ctx, "identity");
          const verification = (
            await ctx.tx.getAll<IdentityVerification>("identityVerifications")
          ).find((v) => v.personaId === actor.personaId);
          const account = (await ctx.tx.getAll<CitizenAccount>("citizenAccounts")).find(
            (a) => a.personaId === actor.personaId,
          );
          if (!verification || !account) {
            throw new RepositoryError("NOT_FOUND", {
              details: { entityType: "persona", personaId: actor.personaId },
            });
          }
          if (verification.status === "verified" || verification.status === "locked") {
            throw new RepositoryError("VALIDATION_ERROR", {
              reason: "INVALID_TRANSITION",
              details: { from: verification.status, to: "attempt" },
            });
          }
          const correlationId = ctx.useCorrelation(null);
          const attempts = verification.attempts + 1;
          // Simulated: only the labelled demo code ever verifies (T-07: never auto-verify).
          const matched = input.code === verification.demoCode;
          const locked = !matched && attempts >= MAX_VERIFICATION_ATTEMPTS;
          const next = ctx.touch(verification, {
            attempts,
            lastAttemptAt: ctx.nowIso,
            status: matched ? "verified" : locked ? "locked" : "failed",
            verifiedAt: matched ? ctx.nowIso : null,
          });
          await ctx.tx.put("identityVerifications", next);
          if (matched || locked) {
            await ctx.tx.put(
              "citizenAccounts",
              ctx.touch(account, {
                status: matched ? "active" : "locked",
                ...(matched ? { verifiedAt: ctx.nowIso } : { lockedAt: ctx.nowIso }),
              }),
            );
          }
          if (matched) {
            // The enrolment record (`pending` link) becomes visible only now — still behind consent.
            const pending = (await ctx.tx.getAll<PatientLink>("patientLinks")).filter(
              (l) => l.personaId === actor.personaId && l.status === "pending",
            );
            for (const link of pending) {
              await ctx.tx.put(
                "patientLinks",
                ctx.touch(link, { status: "active", linkedAt: ctx.nowIso }),
              );
            }
          }
          const summary = {
            attempts,
            attemptsRemaining: Math.max(0, MAX_VERIFICATION_ATTEMPTS - attempts),
            method: verification.method,
          };
          const attempted = await ctx.audit({
            action: "citizen.identity.verification_attempted",
            entityType: "persona",
            entityId: actor.personaId,
            correlationId,
            changeSummary: summary,
          });
          await ctx.audit({
            action: matched ? "citizen.identity.verified" : "citizen.identity.verification_failed",
            entityType: "persona",
            entityId: actor.personaId,
            correlationId,
            before: verification,
            after: next,
            changeSummary: { ...summary, locked },
          });
          return { data: next, entityType: "persona", auditEventId: attempted.id };
        },
      });
    },

    recordGuardDenial(i) {
      return engine.write(async (ctx) => {
        const actor = citizenActor(ctx, i.patientId);
        const linked = (await linksOf(ctx, actor.personaId)).some(
          (l) => l.patientId === i.patientId,
        );
        await ctx.audit({
          action: "access.denied",
          entityType: "patient",
          entityId: i.patientId,
          outcome: "denied",
          patientId: linked ? asId<PatientId>(i.patientId) : null,
          changeSummary: { reason: "CONSENT_REQUIRED", route: i.route, guard: true },
        });
      });
    },

    getConsent(patientId) {
      return engine.read(async (ctx) => {
        await assertPatientAccess(ctx, patientId, { consent: false });
        const history = await consentRecordsOf(ctx, patientId);
        const latest = currentConsent(history);
        return {
          patientId: asId<PatientId>(patientId),
          state: latest?.action ?? "not_recorded",
          latest,
          history,
        };
      });
    },

    recordConsent(i, key) {
      return engine.mutate({
        op: "citizen.recordConsent",
        key,
        input: i,
        entityType: "patient",
        permission: "self.read",
        schema: RecordConsentInputSchema,
        run: async (ctx, input) => {
          const actor = ctx.requireActor();
          const { patient } = await assertPatientAccess(ctx, input.patientId, { consent: false });
          const previous = currentConsent(await consentRecordsOf(ctx, patient.id));
          const current = previous?.action ?? "not_recorded";
          if (current === input.action) {
            throw new RepositoryError("VALIDATION_ERROR", {
              reason: "INVALID_TRANSITION",
              details: { from: current, to: input.action },
            });
          }
          // Append-only and strictly ordered: a record never shares the previous one's instant
          // (frozen demo clock), so "latest" is always unambiguous.
          const recordedAt =
            previous && previous.recordedAt >= ctx.nowIso
              ? new Date(Date.parse(previous.recordedAt) + 1).toISOString()
              : ctx.nowIso;
          const record: ConsentRecord = {
            ...ctx.created(),
            id: ctx.ids(),
            patientId: patient.id,
            personaId: actor.personaId,
            action: input.action,
            noticeVersion: input.noticeVersion,
            recordedAt,
          };
          await ctx.tx.put("consentRecords", record);
          const nextPatient = ctx.touch(patient, { consentState: input.action });
          await ctx.save("patient", nextPatient);
          // Withdrawal cancels scheduled reminders; the preference is kept (re-consent restores
          // the choice, re-planning happens on the next opt-in confirmation — CTZ-05 task 9).
          const cancelled =
            input.action === "withdrawn"
              ? await cancelAllScheduled(ctx, nextPatient, "consent_withdrawn")
              : 0;
          const event = await ctx.audit({
            action:
              input.action === "granted" ? "citizen.consent.granted" : "citizen.consent.withdrawn",
            entityType: "patient",
            entityId: patient.id,
            before: patient,
            after: nextPatient,
            changeSummary: {
              consentFrom: current,
              consentTo: input.action,
              consentRecordId: record.id,
              noticeVersion: record.noticeVersion,
              remindersCancelled: cancelled,
            },
          });
          return { data: record, entityType: "patient", auditEventId: event.id };
        },
      });
    },

    listReleasedObservations(patientId) {
      return engine.read(async (ctx) => {
        await assertPatientAccess(ctx, patientId);
        return observationsOf(ctx, patientId);
      });
    },

    recordResultsListViewed(patientId) {
      return engine.write(async (ctx) => {
        const { patient, link } = await assertPatientAccess(ctx, patientId);
        await recordOwnView(
          ctx,
          patient,
          link,
          { type: "patient", id: patient.id },
          { action: "record_viewed", audit: "citizen.result.list_viewed", dedupe: false },
        );
      });
    },

    getObservation(id, patientId) {
      return engine.read(async (ctx) => {
        const { patient, link } = await assertPatientAccess(ctx, patientId);
        const item = (await observationsOf(ctx, patientId)).find((o) => o.id === id);
        if (!item) {
          // A result of another patient (e.g. a forged deep link): denied + audited, no data.
          const other = await ctx.find<Screening>("screening", id);
          if (other && other.patientId !== patientId) {
            ctx.deny(
              "SCOPE",
              { entityType: "screening", entityId: id },
              { patientId: other.patientId, facilityId: other.facilityId },
              { viaPatientId: patientId },
            );
          }
        }
        if (!item || item.kind !== "released") {
          throw new RepositoryError("NOT_FOUND", { details: { entityType: "screening", id } });
        }
        await recordOwnView(ctx, patient, link, { type: "screening", id: item.id });
        return item;
      });
    },

    listApprovedInstructions(patientId) {
      return engine.read(async (ctx) => {
        await assertPatientAccess(ctx, patientId);
        return instructionsOf(ctx, patientId);
      });
    },

    recordNextStepsListViewed(patientId) {
      return engine.write(async (ctx) => {
        const { patient, link } = await assertPatientAccess(ctx, patientId);
        await recordOwnView(
          ctx,
          patient,
          link,
          { type: "patient", id: patient.id },
          { action: "next_steps_viewed", audit: "citizen.next_step.list_viewed", dedupe: false },
        );
      });
    },

    getInstruction(id, patientId) {
      return engine.read(async (ctx) => {
        const { patient, link } = await assertPatientAccess(ctx, patientId);
        const item = (await instructionsOf(ctx, patientId)).find((c) => c.id === id);
        if (!item) {
          // Not an approved step of this patient (other patient, withdrawn, unreleased, unknown):
          // the same denial for all so a deep link never reveals whether the id exists.
          const owner = (await ctx.find<CareInstruction>("care_instruction", id)) ?? null;
          return ctx.deny(
            "SCOPE",
            { entityType: "care_instruction", entityId: id },
            {
              patientId: owner?.patientId ?? patient.id,
              facilityId: owner?.facilityId ?? patient.facilityId,
            },
            { viaPatientId: patientId },
          );
        }
        await recordOwnView(
          ctx,
          patient,
          link,
          { type: "care_instruction", id: item.id },
          { action: "next_steps_viewed", audit: "citizen.next_step.viewed", dedupe: true },
        );
        return item;
      });
    },

    acknowledgeInstruction(i, key) {
      return engine.mutate({
        op: "citizen.acknowledgeInstruction",
        key,
        input: i,
        entityType: "care_instruction",
        permission: "self.read",
        schema: AcknowledgeInstructionInputSchema,
        run: async (ctx, input) => {
          const actor = ctx.requireActor();
          const { patient } = await assertPatientAccess(ctx, input.patientId);
          const instruction = (await instructionsOf(ctx, patient.id)).find(
            (c) => c.id === input.instructionId,
          );
          if (!instruction) {
            throw new RepositoryError("NOT_FOUND", {
              details: { entityType: "care_instruction", id: input.instructionId },
            });
          }
          // Concurrent update (T-05): the citizen must have read the current version. The
          // demo-tools `conflict-next-write` toggle targets the patient; it is turned into a
          // one-off conflict on this step (consumed here, nothing written).
          if (faults.consumeConflictOnce("patient", patient.id)) {
            faults.set({
              conflictOnce: [
                ...faults.get().conflictOnce,
                { entityType: "care_instruction", entityId: instruction.id },
              ],
            });
          }
          await ctx.assertVersion(
            "care_instruction",
            instruction,
            input.expectedVersion ?? instruction.version,
            { patientId: patient.id, facilityId: patient.facilityId },
          );
          const existing = (await ctx.tx.getAll<NextStepAcknowledgement>("nextStepAcks")).find(
            (a) => a.patientId === patient.id && a.instructionId === instruction.id,
          );
          if (existing) {
            // Already read (other key / device): no second row, the original ack is returned.
            const event = await ctx.audit({
              action: "sync.duplicate_suppressed",
              entityType: "care_instruction",
              entityId: instruction.id,
              patientId: patient.id,
              facilityId: patient.facilityId,
              changeSummary: { op: "citizen.acknowledgeInstruction", ackId: existing.id },
            });
            return { data: existing, entityType: "care_instruction", auditEventId: event.id };
          }
          const ack: NextStepAcknowledgement = {
            ...ctx.created(),
            id: ctx.ids(),
            patientId: patient.id,
            instructionId: instruction.id,
            personaId: actor.personaId,
            acknowledgedAt: ctx.nowIso,
          };
          await ctx.tx.put("nextStepAcks", ack);
          ctx.useCorrelation(await ctx.correlationOf(instruction.id));
          const event = await ctx.audit({
            action: "citizen.next_step.acknowledged",
            entityType: "care_instruction",
            entityId: instruction.id,
            after: ack,
            patientId: patient.id,
            facilityId: patient.facilityId,
            changeSummary: {
              ackId: ack.id,
              idempotencyKey: input.idempotencyKey,
              instructionVersion: instruction.version,
            },
          });
          return { data: ack, entityType: "care_instruction", auditEventId: event.id };
        },
      });
    },

    getNotificationPrefs(patientId) {
      return engine.read(async (ctx) => {
        await assertPatientAccess(ctx, patientId);
        return prefsOf(ctx, patientId);
      });
    },

    updateNotificationPrefs(i, key) {
      return engine.mutate({
        op: "citizen.updateNotificationPrefs",
        key,
        input: i,
        entityType: "reminder_preference",
        permission: "self.reminders.manage",
        schema: UpdateNotificationPrefsInputSchema,
        run: async (ctx, input) => {
          const { patient } = await assertPatientAccess(ctx, input.patientId);
          const existing = await prefsOf(ctx, patient.id);
          if (!existing) {
            throw new RepositoryError("NOT_FOUND", {
              details: { entityType: "reminder_preference", patientId: patient.id },
            });
          }
          // T-05: the demo-tools `conflict-next-write` toggle targets the patient; it becomes a
          // one-off conflict on this preference (consumed here, nothing written).
          if (faults.consumeConflictOnce("patient", patient.id)) {
            faults.set({
              conflictOnce: [
                ...faults.get().conflictOnce,
                { entityType: "reminder_preference", entityId: existing.id },
              ],
            });
          }
          await ctx.assertVersion("reminder_preference", existing, input.expectedVersion, {
            patientId: patient.id,
            facilityId: patient.facilityId,
          });
          const next = ctx.touch(existing, { optedIn: input.optedIn, timing: input.timing });
          await ctx.save("reminder_preference", next);
          ctx.useCorrelation(await ctx.correlationOf(existing.id));
          const change = !next.optedIn
            ? existing.optedIn
              ? "opted_out"
              : "unchanged"
            : !existing.optedIn
              ? "opted_in"
              : existing.timing !== next.timing
                ? "timing_changed"
                : "unchanged";
          // Opted out ⇒ zero scheduled rows; opted in ⇒ the schedule follows the plan.
          let cancelled = 0;
          let scheduled = 0;
          if (!next.optedIn) {
            cancelled = await cancelAllScheduled(ctx, patient, "opted_out");
          } else if (change !== "unchanged") {
            ({ cancelled, scheduled } = await replanReminders(ctx, patient, next));
          }
          const event = await ctx.audit({
            action: "reminder.preference_changed",
            entityType: "reminder_preference",
            entityId: next.id,
            before: existing,
            after: next,
            patientId: patient.id,
            facilityId: patient.facilityId,
            changeSummary: {
              // `citizen.reminder.opted_in|opted_out|preference_changed` (CTZ-05) map here.
              change,
              optedIn: next.optedIn,
              timing: next.timing,
              remindersCancelled: cancelled,
              remindersScheduled: scheduled,
            },
          });
          return { data: next, entityType: "reminder_preference", auditEventId: event.id };
        },
      });
    },

    listReminders(patientId) {
      return engine.read(async (ctx) => {
        await assertPatientAccess(ctx, patientId);
        return remindersOf(ctx, patientId);
      });
    },

    processDueReminders(patientId) {
      return engine.write(async (ctx) => {
        const { patient } = await assertPatientAccess(ctx, patientId);
        const prefs = await prefsOf(ctx, patient.id);
        const now = { now: () => ctx.now };
        const remindable = new Set(
          (await instructionsOf(ctx, patient.id))
            .filter(
              (c) => c.progress === "planned" && REMINDABLE_INSTRUCTION_KINDS.includes(c.kind),
            )
            .map((c) => c.id as string),
        );
        const rows = await remindersOf(ctx, patient.id);
        const cancelled: Reminder[] = [];
        const delivered: Reminder[] = [];
        // A step that no longer gets reminders (withdrawn / completed / not approved) and an
        // opted-out person never receive a delivery.
        for (const row of rows) {
          if (row.status !== "scheduled") continue;
          if (!prefs?.optedIn) {
            cancelled.push(await cancelReminder(ctx, patient, row, "opted_out"));
          } else if (!remindable.has(row.instructionId)) {
            cancelled.push(await cancelReminder(ctx, patient, row, "instruction_cancelled"));
          }
        }
        const gone = new Set(cancelled.map((r) => r.id));
        for (const { reminder, next } of processDueReminders(
          rows.filter((r) => !gone.has(r.id)),
          now,
        )) {
          const updated = ctx.touch(reminder, next);
          await ctx.save("reminder", updated);
          await ctx.audit({
            action: "reminder.delivered_simulated",
            entityType: "reminder",
            entityId: reminder.id,
            before: reminder,
            after: updated,
            patientId: patient.id,
            facilityId: patient.facilityId,
            actor: systemActor,
            changeSummary: {
              systemActor: SCHEDULER,
              instructionId: reminder.instructionId,
              channel: reminder.channel,
              simulated: true,
            },
          });
          delivered.push(updated);
        }
        return { delivered, cancelled };
      });
    },

    acknowledgeReminder(i, key) {
      return engine.mutate({
        op: "citizen.acknowledgeReminder",
        key,
        input: i,
        entityType: "reminder",
        permission: "self.reminders.manage",
        schema: AcknowledgeReminderInputSchema,
        run: async (ctx, input) => {
          const { patient } = await assertPatientAccess(ctx, input.patientId);
          const reminder = await ctx.find<Reminder>("reminder", input.reminderId);
          if (!reminder || reminder.patientId !== patient.id) {
            return ctx.deny(
              "SCOPE",
              { entityType: "reminder", entityId: input.reminderId },
              {
                patientId: reminder?.patientId ?? patient.id,
                facilityId: patient.facilityId,
              },
              { viaPatientId: patient.id },
            );
          }
          if (reminder.status === "acknowledged") {
            // Already seen (other key / device): the stored row is returned unchanged.
            const event = await ctx.audit({
              action: "sync.duplicate_suppressed",
              entityType: "reminder",
              entityId: reminder.id,
              patientId: patient.id,
              facilityId: patient.facilityId,
              changeSummary: { op: "citizen.acknowledgeReminder" },
            });
            return { data: reminder, entityType: "reminder", auditEventId: event.id };
          }
          if (reminder.status !== "delivered_simulated") {
            throw new RepositoryError("VALIDATION_ERROR", {
              reason: "INVALID_TRANSITION",
              details: { from: reminder.status, to: "acknowledged" },
            });
          }
          // Seen ≠ attended: the related next step / follow-up is never touched.
          const next = ctx.touch(reminder, {
            status: "acknowledged",
            acknowledgedAt: ctx.nowIso,
          });
          await ctx.save("reminder", next);
          const event = await ctx.audit({
            action: "reminder.acknowledged",
            entityType: "reminder",
            entityId: reminder.id,
            before: reminder,
            after: next,
            patientId: patient.id,
            facilityId: patient.facilityId,
            changeSummary: {
              instructionId: reminder.instructionId,
              idempotencyKey: input.idempotencyKey,
            },
          });
          return { data: next, entityType: "reminder", auditEventId: event.id };
        },
      });
    },

    recordReminderPreviewSent(patientId) {
      return engine.write(async (ctx) => {
        const { patient } = await assertPatientAccess(ctx, patientId);
        const prefs = await prefsOf(ctx, patient.id);
        await ctx.audit({
          action: "citizen.reminder.preview_sent",
          entityType: prefs ? "reminder_preference" : "patient",
          entityId: prefs?.id ?? patient.id,
          patientId: patient.id,
          facilityId: patient.facilityId,
          changeSummary: { channel: "device_local_preview", timing: prefs?.timing ?? null },
        });
      });
    },

    recordTimelineViewed(patientId) {
      return engine.write(async (ctx) => {
        const { patient, link } = await assertPatientAccess(ctx, patientId);
        await recordOwnView(
          ctx,
          patient,
          link,
          { type: "patient", id: patient.id },
          { action: "record_viewed", audit: "citizen.timeline.viewed", dedupe: false },
        );
      });
    },

    recordChangeViewed(patientId, observationId) {
      return engine.write(async (ctx) => {
        const { patient, link } = await assertPatientAccess(ctx, patientId);
        const item = (await observationsOf(ctx, patientId)).find((o) => o.id === observationId);
        if (!item) {
          const other = await ctx.find<Screening>("screening", observationId);
          if (other && other.patientId !== patientId) {
            ctx.deny(
              "SCOPE",
              { entityType: "screening", entityId: observationId },
              { patientId: other.patientId, facilityId: other.facilityId },
              { viaPatientId: patientId },
            );
          }
        }
        if (!item || item.kind !== "released" || item.amendments.length === 0) {
          throw new RepositoryError("NOT_FOUND", {
            details: { entityType: "screening", id: observationId },
          });
        }
        await recordOwnView(
          ctx,
          patient,
          link,
          { type: "screening", id: item.id },
          { action: "result_viewed", audit: "citizen.change.viewed", dedupe: true },
        );
      });
    },

    listTimeline(patientId) {
      return engine.read(async (ctx) => {
        await assertPatientAccess(ctx, patientId);
        const pid = asId<PatientId>(patientId);
        const items: TimelineItem[] = [];
        const add = (item: Omit<TimelineItem, "patientId">) =>
          items.push({ ...item, patientId: pid });
        for (const o of await observationsOf(ctx, patientId)) {
          if (o.kind === "pending_review") {
            add({
              id: `awaiting:${o.id}`,
              kind: "awaiting_review",
              state: "waiting",
              occurredAt: o.measuredAt,
              refType: "observation",
              refId: o.id,
            });
            continue;
          }
          add({
            id: `result:${o.id}`,
            kind: "result_shared",
            state: "done",
            occurredAt: o.reviewedAt ?? o.measuredAt,
            refType: "observation",
            refId: o.id,
          });
          o.amendments.forEach((a, index) =>
            add({
              id: `amended:${o.id}:${index}`,
              kind: "record_updated",
              state: "changed",
              occurredAt: a.amendedAt,
              refType: "observation",
              refId: o.id,
            }),
          );
        }
        for (const c of await instructionsOf(ctx, patientId)) {
          add({
            id: `step:${c.id}`,
            kind: "next_step",
            state:
              c.progress === "completed"
                ? "done"
                : c.progress === "cancelled"
                  ? "cancelled"
                  : "waiting",
            occurredAt: c.releasedAt,
            refType: "instruction",
            refId: c.id,
          });
          if (c.acknowledgement) {
            add({
              id: `read:${c.acknowledgement.id}`,
              kind: "next_step_read",
              state: "done",
              occurredAt: c.acknowledgement.acknowledgedAt,
              refType: "acknowledgement",
              refId: c.acknowledgement.id,
            });
          }
        }
        for (const r of await ctx.all<Reminder>("reminder")) {
          if (r.patientId !== patientId || r.deliveredAt === null) continue;
          add({
            id: `reminder:${r.id}`,
            kind: "reminder_sent",
            state: "info",
            occurredAt: r.deliveredAt,
            refType: "reminder",
            refId: r.id,
          });
        }
        for (const t of await citizenTasks(ctx, patientId)) {
          if (t.kind !== "correction_request") continue;
          const correction = toCorrection(t);
          add({
            id: `correction:${t.id}`,
            kind: "correction_requested",
            state: "waiting",
            occurredAt: t.createdAt,
            refType: "correction",
            refId: t.id,
          });
          if (correction.resolvedAt) {
            add({
              id: `resolved:${t.id}`,
              kind: "correction_resolved",
              state: correction.status === "resolved_amended" ? "changed" : "done",
              occurredAt: correction.resolvedAt,
              refType: "correction",
              refId: t.id,
            });
          }
        }
        for (const c of await consentRecordsOf(ctx, patientId)) {
          add({
            id: `consent:${c.id}`,
            kind: c.action === "granted" ? "consent_granted" : "consent_withdrawn",
            state: "info",
            occurredAt: c.recordedAt,
            refType: "consent",
            refId: c.id,
          });
        }
        return items.sort(desc((x) => x.occurredAt));
      });
    },

    listAccessEvents(patientId) {
      return engine.read(async (ctx) => {
        await assertPatientAccess(ctx, patientId);
        return (
          (await ctx.tx.getAll<CitizenAccessEvent>("accessEvents"))
            // Wallet-internal system actions (scheduler etc.) have no person behind them.
            .filter((e) => e.patientId === patientId && e.actorId !== null)
            // Who / what / when only: staff justifications and change details stay staff-side.
            .map((e): CitizenAccessEvent => ({ ...e, changeSummary: {}, justification: null }))
            .sort(desc((e) => e.occurredAt))
        );
      });
    },

    recordAccessHistoryViewed(patientId) {
      return engine.write(async (ctx) => {
        const { patient } = await assertPatientAccess(ctx, patientId);
        await ctx.audit({
          action: "citizen.access_history.viewed",
          entityType: "patient",
          entityId: patient.id,
          correlationId: asId<CorrelationId>(ctx.ids()),
          patientId: patient.id,
          facilityId: patient.facilityId,
          changeSummary: {},
        });
      });
    },

    recordPrivacyNoticeViewed(noticeVersion) {
      return engine.write(async (ctx) => {
        const actor = citizenActor(ctx, "privacy-notice");
        await ctx.audit({
          action: "citizen.privacy_notice.viewed",
          entityType: "persona",
          entityId: actor.personaId,
          correlationId: asId<CorrelationId>(ctx.ids()),
          changeSummary: { noticeVersion },
        });
      });
    },

    recordSupportViewed() {
      return engine.write(async (ctx) => {
        const actor = citizenActor(ctx, "support");
        await ctx.audit({
          action: "citizen.support.viewed",
          entityType: "persona",
          entityId: actor.personaId,
          correlationId: asId<CorrelationId>(ctx.ids()),
          changeSummary: {},
        });
      });
    },

    recordHelpViewed() {
      return engine.write(async (ctx) => {
        const actor = citizenActor(ctx, "help");
        await ctx.audit({
          action: "citizen.help.viewed",
          entityType: "persona",
          entityId: actor.personaId,
          correlationId: asId<CorrelationId>(ctx.ids()),
          changeSummary: {},
        });
      });
    },

    listCorrectionTargets(patientId) {
      return engine.read(async (ctx) => {
        const { patient } = await assertPatientAccess(ctx, patientId);
        return correctionTargetsOf(ctx, patient);
      });
    },

    createCorrectionRequest(i, key) {
      return engine.mutate({
        op: "citizen.createCorrectionRequest",
        key,
        input: i,
        entityType: "care_task",
        permission: "self.correction.request",
        schema: CorrectionRequestInputSchema,
        run: async (ctx, input) => {
          const actor = ctx.requireActor();
          const { patient } = await assertPatientAccess(ctx, input.patientId);
          // Only records the citizen can actually see may be the subject of a request.
          const target = (await correctionTargetsOf(ctx, patient)).find(
            (t) => t.targetType === input.targetType && t.targetId === input.targetId,
          );
          if (!target) {
            throw new RepositoryError("VALIDATION_ERROR", {
              fieldErrors: { targetId: { key: "invalid", params: {} } },
            });
          }
          const scope = { patientId: patient.id, facilityId: patient.facilityId };
          // T-05: the item changed since the citizen picked it (or the demo-tools
          // `conflict-next-write` toggle on the patient) → CONFLICT, nothing written. `latest`
          // is the citizen-visible picker item, never the raw clinical record.
          if (faults.consumeConflictOnce("patient", patient.id)) {
            faults.set({
              conflictOnce: [
                ...faults.get().conflictOnce,
                { entityType: target.targetType, entityId: target.targetId },
              ],
            });
          }
          await ctx.assertVersion(
            target.targetType,
            { ...target, id: target.targetId, updatedAt: ctx.nowIso },
            input.expectedTargetVersion ?? target.version,
            scope,
          );
          // One open request per item: a second one is blocked with a link to the first.
          const open = (await citizenTasks(ctx, patient.id))
            .filter(
              (t): t is CareTask & { kind: "correction_request" } =>
                t.kind === "correction_request",
            )
            .find(
              (t) =>
                t.payload.targetType === input.targetType &&
                t.payload.targetId === input.targetId &&
                isOpenCorrection(correctionStatusOf(t)),
            );
          if (open) {
            throw defer(
              new RepositoryError("VALIDATION_ERROR", {
                reason: "DUPLICATE_OPEN_REQUEST",
                details: { existingId: open.id, existingCreatedAt: open.createdAt },
              }),
              {
                action: "citizen.correction.duplicate_blocked",
                entityType: "care_task",
                entityId: open.id,
                outcome: "denied",
                ...scope,
                changeSummary: { targetType: input.targetType, targetId: input.targetId },
                actorId: actor.personaId,
                actorRole: actor.role,
                occurredAt: ctx.nowIso,
              },
            );
          }
          const task: CitizenCareTask = {
            ...ctx.created(),
            id: asId<CareTaskId>(ctx.ids()),
            kind: "correction_request",
            payload: {
              targetType: input.targetType,
              targetId: input.targetId,
              description: input.description,
              suggestedValue: input.suggestedValue,
              requestStatus: "submitted",
              assignedRole: "clinician",
            },
            status: "open",
            patientId: patient.id,
            facilityId: patient.facilityId,
            assignedToId: null,
            createdBy: actor.personaId,
            dueAt: null,
            completedAt: null,
            cancelled: null,
          };
          await ctx.save("care_task", task);
          // Both events share one correlation (the target's chain when it has one).
          ctx.useCorrelation(await ctx.correlationOf(input.targetId));
          const event = await ctx.audit({
            action: "correction.requested",
            entityType: "care_task",
            entityId: task.id,
            after: task,
            changeSummary: {
              targetType: input.targetType,
              targetId: input.targetId,
              targetVersion: target.version,
            },
          });
          await ctx.audit({
            action: "task.created",
            entityType: "care_task",
            entityId: task.id,
            after: task,
            changeSummary: { kind: task.kind, assignedRole: "clinician" },
          });
          return { data: task, entityType: "care_task", auditEventId: event.id };
        },
      });
    },

    listCorrectionRequests(patientId) {
      return engine.read(async (ctx) => {
        await assertPatientAccess(ctx, patientId);
        return (await citizenTasks(ctx, patientId))
          .filter(
            (t): t is CareTask & { kind: "correction_request" } => t.kind === "correction_request",
          )
          .map(toCorrection)
          .sort(desc((c) => c.createdAt));
      });
    },

    getCorrectionRequest(id, patientId) {
      return engine.write(async (ctx) => {
        const { patient } = await assertPatientAccess(ctx, patientId);
        const task = await ctx.find<CareTask>("care_task", id);
        if (task && task.kind === "correction_request" && task.patientId !== patient.id) {
          ctx.deny(
            "SCOPE",
            { entityType: "care_task", entityId: id },
            { patientId: task.patientId, facilityId: task.facilityId },
            { viaPatientId: patient.id },
          );
        }
        if (!task || task.kind !== "correction_request") {
          throw new RepositoryError("NOT_FOUND", { details: { entityType: "care_task", id } });
        }
        const actor = ctx.requireActor();
        const minute = String(Math.floor(ctx.now.getTime() / 60_000));
        const metaKey = `ctz.correction.${actor.personaId}.${task.id}`;
        if ((await ctx.tx.getMeta(metaKey)) !== minute) {
          await ctx.tx.setMeta(metaKey, minute);
          await ctx.audit({
            action: "citizen.correction.viewed",
            entityType: "care_task",
            entityId: task.id,
            correlationId: asId<CorrelationId>(ctx.ids()),
            patientId: patient.id,
            facilityId: patient.facilityId,
            changeSummary: {},
          });
        }
        return toCorrection(task);
      });
    },

    createCallbackRequest(i, key) {
      return engine.mutate({
        op: "citizen.createCallbackRequest",
        key,
        input: i,
        entityType: "care_task",
        permission: "self.read",
        schema: CallbackRequestInputSchema,
        run: async (ctx, input) => {
          const actor = ctx.requireActor();
          const { patient } = await assertPatientAccess(ctx, input.patientId, { consent: false });
          const task: CitizenCareTask = {
            ...ctx.created(),
            id: asId<CareTaskId>(ctx.ids()),
            kind: "callback_request",
            payload: { topic: input.topic, window: input.window, note: input.note ?? "" },
            status: "open",
            patientId: patient.id,
            facilityId: patient.facilityId,
            assignedToId: null,
            createdBy: actor.personaId,
            dueAt: null,
            completedAt: null,
            cancelled: null,
          };
          await ctx.save("care_task", task);
          const event = await ctx.audit({
            action: "citizen.support.callback_requested",
            entityType: "care_task",
            entityId: task.id,
            after: task,
            changeSummary: { topic: input.topic, window: input.window },
          });
          await ctx.audit({
            action: "task.created",
            entityType: "care_task",
            entityId: task.id,
            after: task,
            changeSummary: { kind: task.kind },
          });
          return { data: task, entityType: "care_task", auditEventId: event.id };
        },
      });
    },

    getSettings() {
      return engine.read(async (ctx) => {
        const actor = citizenActor(ctx, "settings");
        return (
          (await ctx.tx.getAll<CitizenSettings>("citizenSettings")).find(
            (s) => s.personaId === actor.personaId,
          ) ?? null
        );
      });
    },

    updateSettings(i, key) {
      return engine.mutate({
        op: "citizen.updateSettings",
        key,
        input: i,
        entityType: "persona",
        permission: "self.read",
        schema: UpdateCitizenSettingsInputSchema,
        run: async (ctx, input) => {
          const actor = citizenActor(ctx, "settings");
          const persona = await ctx.tx.get<DemoPersona>("personas", actor.personaId);
          const existing = (await ctx.tx.getAll<CitizenSettings>("citizenSettings")).find(
            (s) => s.personaId === actor.personaId,
          );
          const patch: Partial<CitizenSettings> = {};
          if (input.language !== undefined) patch.language = input.language;
          if (input.textScale !== undefined) patch.textScale = input.textScale;
          if (input.highContrast !== undefined) patch.highContrast = input.highContrast;
          let next: CitizenSettings;
          if (existing) {
            if (input.expectedVersion !== undefined) {
              await ctx.assertVersion("persona", existing, input.expectedVersion);
            }
            next = ctx.touch(existing, patch);
          } else {
            next = {
              ...ctx.created(),
              id: ctx.ids(),
              personaId: actor.personaId,
              language: persona?.preferredLanguage ?? "en",
              textScale: 1,
              highContrast: false,
              ...patch,
            };
          }
          await ctx.tx.put("citizenSettings", next);
          const event = await ctx.audit({
            action: "citizen.settings.changed",
            entityType: "persona",
            entityId: actor.personaId,
            before: existing ?? null,
            after: next,
            changeSummary: { changed: Object.keys(patch).sort() },
          });
          return { data: next, entityType: "persona", auditEventId: event.id };
        },
      });
    },

    demo: {
      ...createDemoApi({ engine, remote: null, faults, seed }),
      simulateCareTeamConfirmation,
    },
  };

  const wrapped = withSimulatedTransport(repository, faults, {
    sleep,
    ready: () => engine.ready(),
  });

  /** "Nothing was changed" — but the unavailable attempt itself is attributable (audit only). */
  async function recordVerificationUnavailable(): Promise<void> {
    await engine.write(async (ctx) => {
      if (!ctx.actor || ctx.actor.role !== "citizen") return;
      await ctx.audit({
        action: "citizen.identity.verification_unavailable",
        entityType: "persona",
        entityId: ctx.actor.personaId,
        changeSummary: { simulated: true, changed: false },
      });
    });
  }

  return {
    ...wrapped,
    async verifyIdentity(i, key) {
      await engine.ready();
      try {
        return await simulateTransport(faults, sleep, () => repository.verifyIdentity(i, key));
      } catch (error) {
        if (error instanceof RepositoryError && error.code === "DEPENDENCY_UNAVAILABLE") {
          await recordVerificationUnavailable().catch(() => undefined);
        }
        throw error;
      }
    },
  };
}

/** persona id → `CTZ-P1` … `CTZ-P5` (inverse of FND-05 `CITIZEN_PERSONA_CODES`). */
const CITIZEN_CODES: Readonly<Record<string, string>> = Object.fromEntries(
  Object.entries(CITIZEN_PERSONA_CODES).map(([code, personaId]) => [personaId, code]),
);
