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
  CallbackRequestInputSchema,
  CorrectionRequestInputSchema,
  RecordConsentInputSchema,
  UpdateCitizenSettingsInputSchema,
  UpdateNotificationPrefsInputSchema,
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
  type ReminderPreference,
  type Review,
  type Screening,
} from "@laif/domain";
import { CITIZEN_PERSONA_CODES, createSeed, type SeedDataset } from "@laif/mock-data";

import type { RepositoryDeps } from "../care-repository.ts";
import { Engine, type TxContext } from "../core/engine.ts";
import { RepositoryError } from "../errors.ts";
import { applyClockOffset, createDemoApi, META_KEYS } from "../services/demo.ts";
import { createFaultInjector, FAULTS_META_KEY } from "../transport/faults.ts";
import { realSleep, withSimulatedTransport } from "../transport/simulated.ts";
import type {
  CitizenLinkedPatient,
  CitizenPersonaSummary,
  CitizenRepository,
  CitizenRepositoryDeps,
  CitizenSession,
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
  ): Promise<void> {
    const actor = ctx.requireActor();
    const minute = String(Math.floor(ctx.now.getTime() / 60_000));
    const metaKey = `ctz.access.${actor.personaId}.${resource.id}`;
    if ((await ctx.tx.getMeta(metaKey)) === minute) return;
    await ctx.tx.setMeta(metaKey, minute);
    const correlationId = asId<CorrelationId>(ctx.ids());
    const event: CitizenAccessEvent = {
      ...ctx.created(),
      id: ctx.ids(),
      patientId: patient.id,
      actorId: actor.personaId,
      actorRole: actor.role,
      action: "result_viewed",
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
      action: "citizen.result.viewed",
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
      version: task.version,
      createdAt: task.createdAt,
      updatedAt: task.updatedAt,
      synthetic: true,
    };
  }

  // ── Repository ────────────────────────────────────────────────────────────

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

    startSession() {
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
        return session;
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
          let cancelled = 0;
          if (input.action === "withdrawn") {
            for (const reminder of await ctx.all<Reminder>("reminder")) {
              if (reminder.patientId !== patient.id || reminder.status !== "scheduled") continue;
              await ctx.save(
                "reminder",
                ctx.touch(reminder, { status: "cancelled", cancelReason: "consent_withdrawn" }),
              );
              cancelled += 1;
            }
          }
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

    getObservation(id, patientId) {
      return engine.read(async (ctx) => {
        const { patient, link } = await assertPatientAccess(ctx, patientId);
        const item = (await observationsOf(ctx, patientId)).find((o) => o.id === id);
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
            changeSummary: { ackId: ack.id },
          });
          return { data: ack, entityType: "care_instruction", auditEventId: event.id };
        },
      });
    },

    getNotificationPrefs(patientId) {
      return engine.read(async (ctx) => {
        await assertPatientAccess(ctx, patientId);
        return (
          (await ctx.all<ReminderPreference>("reminder_preference")).find(
            (p) => p.patientId === patientId,
          ) ?? null
        );
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
          const existing = (await ctx.all<ReminderPreference>("reminder_preference")).find(
            (p) => p.patientId === patient.id,
          );
          if (!existing) {
            throw new RepositoryError("NOT_FOUND", {
              details: { entityType: "reminder_preference", patientId: patient.id },
            });
          }
          await ctx.assertVersion("reminder_preference", existing, input.expectedVersion, {
            patientId: patient.id,
            facilityId: patient.facilityId,
          });
          const next = ctx.touch(existing, { optedIn: input.optedIn, timing: input.timing });
          await ctx.save("reminder_preference", next);
          let cancelled = 0;
          if (!input.optedIn) {
            for (const reminder of await ctx.all<Reminder>("reminder")) {
              if (reminder.patientId !== patient.id || reminder.status !== "scheduled") continue;
              await ctx.save(
                "reminder",
                ctx.touch(reminder, { status: "cancelled", cancelReason: "opted_out" }),
              );
              cancelled += 1;
            }
          }
          ctx.useCorrelation(await ctx.correlationOf(existing.id));
          const event = await ctx.audit({
            action: "reminder.preference_changed",
            entityType: "reminder_preference",
            entityId: next.id,
            before: existing,
            after: next,
            patientId: patient.id,
            facilityId: patient.facilityId,
            changeSummary: {
              optedIn: next.optedIn,
              timing: next.timing,
              remindersCancelled: cancelled,
            },
          });
          return { data: next, entityType: "reminder_preference", auditEventId: event.id };
        },
      });
    },

    listReminders(patientId) {
      return engine.read(async (ctx) => {
        await assertPatientAccess(ctx, patientId);
        return (await ctx.all<Reminder>("reminder"))
          .filter((r) => r.patientId === patientId)
          .sort((a, b) =>
            a.scheduledAt < b.scheduledAt ? -1 : a.scheduledAt > b.scheduledAt ? 1 : byIdAsc(a, b),
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
        return (await ctx.tx.getAll<CitizenAccessEvent>("accessEvents"))
          .filter((e) => e.patientId === patientId)
          .sort(desc((e) => e.occurredAt));
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
          let visible = false;
          if (input.targetType === "patient") visible = input.targetId === patient.id;
          else if (input.targetType === "screening") {
            visible = (await observationsOf(ctx, patient.id)).some(
              (o) => o.kind === "released" && o.id === input.targetId,
            );
          } else if (input.targetType === "care_instruction") {
            visible = (await instructionsOf(ctx, patient.id)).some((c) => c.id === input.targetId);
          }
          if (!visible) {
            throw new RepositoryError("VALIDATION_ERROR", {
              fieldErrors: { targetId: { key: "invalid", params: {} } },
            });
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
          ctx.useCorrelation(await ctx.correlationOf(input.targetId));
          const event = await ctx.audit({
            action: "correction.requested",
            entityType: "care_task",
            entityId: task.id,
            after: task,
            changeSummary: { targetType: input.targetType, targetId: input.targetId },
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

    demo: createDemoApi({ engine, remote: null, faults, seed }),
  };

  return withSimulatedTransport(repository, faults, { sleep, ready: () => engine.ready() });
}

/** persona id → `CTZ-P1` … `CTZ-P5` (inverse of FND-05 `CITIZEN_PERSONA_CODES`). */
const CITIZEN_CODES: Readonly<Record<string, string>> = Object.fromEntries(
  Object.entries(CITIZEN_PERSONA_CODES).map(([code, personaId]) => [personaId, code]),
);
