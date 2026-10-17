/**
 * Low-level seed builder: creates records and replays legal FND-02 transitions on them, emitting
 * one `change` audit event per mutation (correlation IDs link screening → review → referral →
 * follow-up). The generator (generate.ts) only calls these helpers — it never assigns a status
 * directly.
 */
import {
  applyAmendment,
  type AuditCategory,
  type AuditOutcome,
  type Brand,
  assertCancellationReason,
  assertCompletionEvidence,
  assertDismissalReason,
  assertFollowUpTransition,
  careTaskMachine,
  evaluateScreening,
  referralMachine,
  reviewMachine,
  screeningMachine,
  type AmendableScreeningField,
  type AmendableValue,
  type AuditEvent,
  type AuditEventId,
  type CareInstruction,
  type CareInstructionId,
  type CareInstructionKind,
  type CareTask,
  type CareTaskStatus,
  type CompletionEvidenceType,
  type ContactAttemptId,
  type ContactMethod,
  type ContactResult,
  type CorrelationId,
  type DemoRuleset,
  type DismissReasonCode,
  type DistrictId,
  type EntityType,
  type FacilityId,
  type FollowUp,
  type FollowUpId,
  type FollowUpOutcome,
  type FollowUpPurpose,
  type FollowUpStatus,
  type JsonValue,
  type Patient,
  type PatientId,
  type PersonaId,
  type Referral,
  type ReferralCancelReasonCode,
  type ReferralId,
  type ReferralOutcome,
  type Reminder,
  type ReminderCancelReason,
  type ReminderId,
  type Review,
  type ReviewDecisionKind,
  type ReviewId,
  type ReviewPriority,
  type Role,
  type Screening,
  type ScreeningAmendmentId,
  type ScreeningId,
  type ScreeningObservation,
  type ScreeningSource,
  type ScreeningStatus,
  type GlucoseContext,
  type GlucoseUnit,
  type UnableToReachReason,
} from "@laif/domain";

import { ID_NAMESPACES, seedId } from "../ids.ts";
import { FACILITIES_REFERENCE, FACILITY_TO_DISTRICT } from "../reference/facilities.ts";
import { DEMO_PERSONAS } from "../reference/personas.ts";

const DAY_MS = 86_400_000;
const MINUTE_MS = 60_000;
/** Seeded timestamps stay within −60 … +14 days of the demo clock (FND-05 task 1). */
export const SEED_WINDOW_DAYS = { min: -60, max: 14 } as const;

const ROLE_BY_PERSONA: ReadonlyMap<string, Role> = new Map(
  DEMO_PERSONAS.map((p) => [p.id, p.role] as const),
);
const FACILITY_NAME: ReadonlyMap<string, string> = new Map(
  FACILITIES_REFERENCE.map((f) => [f.id, f.name] as const),
);

export type Readings = {
  systolic: number | null;
  diastolic: number | null;
  glucoseValue: number | null;
  glucoseUnit: GlucoseUnit | null;
  glucoseContext: GlucoseContext | null;
};

type Scope = {
  facilityId: FacilityId | null;
  districtId: DistrictId | null;
  patientId: PatientId | null;
};

type PendingAudit = Omit<AuditEvent, "id"> & { seq: number };

/** Options of builders other than the base seed (e.g. the ADM-01 admin analytics overlay). */
export type SeedBuilderOptions = {
  /** Allowed offsets from the demo clock in days (default `SEED_WINDOW_DAYS`). */
  windowDays?: { min: number; max: number };
  /**
   * Prefix of every ID namespace (default none = the base seed IDs). Overlays use their own
   * prefix so their records never collide with base records.
   */
  idPrefix?: string;
};

export class SeedBuilder {
  readonly nowMs: number;
  readonly ruleset: DemoRuleset;
  private readonly window: { min: number; max: number };
  private readonly idPrefix: string;
  private readonly pending: PendingAudit[] = [];
  private seq = 0;
  private attemptNo = 0;
  private amendmentNo = 0;

  constructor(nowIso: string, ruleset: DemoRuleset, options: SeedBuilderOptions = {}) {
    this.window = options.windowDays ?? SEED_WINDOW_DAYS;
    this.idPrefix = options.idPrefix ?? "";
    this.nowMs = Date.parse(nowIso);
    if (Number.isNaN(this.nowMs)) throw new RangeError(`createSeed: invalid nowIso ${nowIso}`);
    this.ruleset = ruleset;
  }

  // ── Time ─────────────────────────────────────────────────────────────────
  /** ISO instant `days` (fractional allowed) from the demo clock, rounded to the minute. */
  at(days: number): string {
    if (days < this.window.min || days > this.window.max) {
      throw new RangeError(
        `seed timestamp outside the ${this.window.min}…+${this.window.max} day window: ${days}`,
      );
    }
    const ms = Math.round((this.nowMs + days * DAY_MS) / MINUTE_MS) * MINUTE_MS;
    return new Date(ms).toISOString();
  }

  /** Stable seed ID in this builder's namespace (see `SeedBuilderOptions.idPrefix`). */
  sid<T extends Brand<string, string>>(namespace: string, n: number): T {
    return seedId<T>(`${this.idPrefix}${namespace}`, n);
  }

  // ── Audit ────────────────────────────────────────────────────────────────
  audit(input: {
    action: string;
    entityType: EntityType;
    entityId: string;
    actorId: PersonaId | null;
    at: string;
    correlationId: CorrelationId;
    scope: Scope;
    summary: { [key: string]: JsonValue };
    /** Defaults: `change` / `success` / no justification / role of the seed persona. */
    category?: AuditCategory;
    outcome?: AuditOutcome;
    justification?: string | null;
    actorRole?: Role | null;
  }): void {
    this.seq += 1;
    this.pending.push({
      seq: this.seq,
      actorId: input.actorId,
      actorRole:
        input.actorRole !== undefined
          ? input.actorRole
          : input.actorId === null
            ? null
            : (ROLE_BY_PERSONA.get(input.actorId) ?? null),
      action: input.action,
      entityType: input.entityType,
      entityId: input.entityId,
      occurredAt: input.at,
      correlationId: input.correlationId,
      category: input.category ?? "change",
      outcome: input.outcome ?? "success",
      facilityId: input.scope.facilityId,
      districtId: input.scope.districtId,
      patientId: input.scope.patientId,
      changeSummary: input.summary,
      justification: input.justification ?? null,
      version: 1,
      createdAt: input.at,
      updatedAt: input.at,
      synthetic: true,
    });
  }

  /** Audit trail sorted by time (stable), IDs assigned in that order. */
  auditEvents(): AuditEvent[] {
    return [...this.pending]
      .sort((a, b) => Date.parse(a.occurredAt) - Date.parse(b.occurredAt) || a.seq - b.seq)
      .map((event, index) => {
        const { seq, ...rest } = event;
        void seq;
        return { id: this.sid<AuditEventId>(ID_NAMESPACES.auditEvent, index + 1), ...rest };
      });
  }

  private touch<T extends { version: number; updatedAt: string }>(entity: T, at: string): void {
    if (Date.parse(at) < Date.parse(entity.updatedAt)) {
      throw new RangeError(`seed mutation goes back in time: ${at} < ${entity.updatedAt}`);
    }
    entity.version += 1;
    entity.updatedAt = at;
  }

  private scopeOf(entity: { facilityId: FacilityId; patientId: PatientId }): Scope {
    return {
      facilityId: entity.facilityId,
      districtId: FACILITY_TO_DISTRICT[entity.facilityId] ?? null,
      patientId: entity.patientId,
    };
  }

  // ── Patients ─────────────────────────────────────────────────────────────
  registerPatient(patient: Patient, by: PersonaId, correlationId: CorrelationId): Patient {
    this.audit({
      action: "patient.registered",
      entityType: "patient",
      entityId: patient.id,
      actorId: by,
      at: patient.createdAt,
      correlationId,
      scope: {
        facilityId: patient.facilityId,
        districtId: patient.districtId,
        patientId: patient.id,
      },
      summary: { identityStatus: patient.identityStatus, consentState: patient.consentState },
    });
    return patient;
  }

  withdrawConsent(patient: Patient, at: string, by: PersonaId, correlationId: CorrelationId): void {
    const from = patient.consentState;
    this.touch(patient, at);
    patient.consentState = "withdrawn";
    this.audit({
      action: "patient.consent_withdrawn",
      entityType: "patient",
      entityId: patient.id,
      actorId: by,
      at,
      correlationId,
      scope: {
        facilityId: patient.facilityId,
        districtId: patient.districtId,
        patientId: patient.id,
      },
      summary: { consentFrom: from, consentTo: "withdrawn" },
    });
  }

  // ── Screenings ───────────────────────────────────────────────────────────
  private screeningStatus(
    s: Screening,
    to: ScreeningStatus,
    at: string,
    by: PersonaId | null,
    action: string,
    correlationId: CorrelationId,
    extra: { [key: string]: JsonValue } = {},
  ): void {
    screeningMachine.assert(s.status, to);
    const from = s.status;
    this.touch(s, at);
    s.status = to;
    this.audit({
      action,
      entityType: "screening",
      entityId: s.id,
      actorId: by,
      at,
      correlationId,
      scope: this.scopeOf(s),
      summary: { fromStatus: from, toStatus: to, ...extra },
    });
  }

  /**
   * Records a screening: draft → (submitted → evaluated). `expect` is the intended status; the
   * stored flag is the demo engine's result and must agree with it.
   */
  screening(input: {
    n: number;
    patient: Patient;
    workerId: PersonaId;
    measuredAt: string;
    readings: Readings;
    source: ScreeningSource;
    expect: ScreeningStatus;
    correlationId: CorrelationId;
    observations?: ScreeningObservation[];
    notes?: string;
    captureDurationSeconds?: number | null;
    /** Ruleset evaluated at submission (default: the builder's ruleset). */
    ruleset?: DemoRuleset;
  }): Screening {
    const id = this.sid<ScreeningId>(ID_NAMESPACES.screening, input.n);
    const s: Screening = {
      id,
      patientId: input.patient.id,
      workerId: input.workerId,
      facilityId: input.patient.facilityId,
      districtId: input.patient.districtId,
      measuredAt: input.measuredAt,
      ...input.readings,
      observations: input.observations ?? [],
      source: input.source,
      rulesetVersion: null,
      status: "draft",
      flag: null,
      clientMutationId: this.sid(ID_NAMESPACES.clientMutation, input.n),
      captureDurationSeconds: input.captureDurationSeconds ?? null,
      notes: input.notes ?? "",
      amendments: [],
      version: 1,
      createdAt: input.measuredAt,
      updatedAt: input.measuredAt,
      synthetic: true,
    };
    this.audit({
      action: "screening.created",
      entityType: "screening",
      entityId: id,
      actorId: input.workerId,
      at: input.measuredAt,
      correlationId: input.correlationId,
      scope: this.scopeOf(s),
      summary: { fromStatus: null, toStatus: "draft", source: input.source },
    });
    if (input.expect === "draft") return s;

    const submittedAt = new Date(Date.parse(input.measuredAt) + 4 * MINUTE_MS).toISOString();
    this.screeningStatus(
      s,
      "submitted",
      submittedAt,
      input.workerId,
      "screening.submitted",
      input.correlationId,
    );
    const ruleset = input.ruleset ?? this.ruleset;
    const flag = evaluateScreening(input.readings, ruleset);
    const outcome: ScreeningStatus = flag.requiresReview ? "review_required" : "no_review_required";
    if (outcome !== input.expect) {
      throw new Error(
        `seed screening ${input.n}: readings evaluate to ${outcome}, plan says ${input.expect}`,
      );
    }
    s.flag = flag;
    s.rulesetVersion = ruleset.version;
    this.screeningStatus(
      s,
      outcome,
      submittedAt,
      null,
      "screening.evaluated",
      input.correlationId,
      {
        reasonCodes: flag.reasonCodes,
        rulesetVersion: flag.rulesetVersion,
      },
    );
    return s;
  }

  amend(
    s: Screening,
    field: AmendableScreeningField,
    after: AmendableValue,
    reason: string,
    by: PersonaId,
    at: string,
    correlationId: CorrelationId,
  ): void {
    this.amendmentNo += 1;
    const next = applyAmendment(s, {
      id: this.sid<ScreeningAmendmentId>(ID_NAMESPACES.amendment, this.amendmentNo),
      field,
      after,
      reason,
      amendedBy: by,
      amendedAt: at,
    });
    Object.assign(s, next);
    this.audit({
      action: "screening.amended",
      entityType: "screening",
      entityId: s.id,
      actorId: by,
      at,
      correlationId,
      scope: this.scopeOf(s),
      summary: { field, before: next.amendments.at(-1)?.before ?? null, after },
    });
  }

  // ── Reviews ──────────────────────────────────────────────────────────────
  review(input: {
    n: number;
    screening: Screening;
    assignedClinicianId: PersonaId;
    priority?: ReviewPriority;
    correlationId: CorrelationId;
  }): Review {
    const { screening } = input;
    if (screening.status !== "review_required" || screening.flag === null) {
      throw new Error(`seed review ${input.n}: screening is not review_required`);
    }
    const at = screening.updatedAt;
    const r: Review = {
      id: this.sid<ReviewId>(ID_NAMESPACES.review, input.n),
      screeningId: screening.id,
      patientId: screening.patientId,
      facilityId: screening.facilityId,
      assignedClinicianId: input.assignedClinicianId,
      status: "pending",
      flagReasons: [...screening.flag.reasonCodes],
      evidenceSnapshot: {
        flag: structuredClone(screening.flag),
        inputs: {
          systolic: screening.systolic,
          diastolic: screening.diastolic,
          glucoseValue: screening.glucoseValue,
          glucoseUnit: screening.glucoseUnit,
          glucoseContext: screening.glucoseContext,
        },
        capturedAt: at,
        capturedBy: screening.workerId,
      },
      decision: null,
      decisionReason: null,
      reviewedAt: null,
      startedBy: null,
      reviewedBy: null,
      priority: input.priority ?? "routine",
      reviewDueAt: new Date(Date.parse(at) + 2 * DAY_MS).toISOString(),
      origin: "rule_flag",
      version: 1,
      createdAt: at,
      updatedAt: at,
      synthetic: true,
    };
    this.audit({
      action: "review.created",
      entityType: "review",
      entityId: r.id,
      actorId: null,
      at,
      correlationId: input.correlationId,
      scope: this.scopeOf(r),
      summary: { fromStatus: null, toStatus: "pending", flagReasons: r.flagReasons },
    });
    return r;
  }

  private reviewStatus(
    r: Review,
    to: Review["status"],
    at: string,
    by: PersonaId,
    action: string,
    correlationId: CorrelationId,
    extra: { [key: string]: JsonValue } = {},
  ): void {
    reviewMachine.assert(r.status, to);
    const from = r.status;
    this.touch(r, at);
    r.status = to;
    this.audit({
      action,
      entityType: "review",
      entityId: r.id,
      actorId: by,
      at,
      correlationId,
      scope: this.scopeOf(r),
      summary: { fromStatus: from, toStatus: to, ...extra },
    });
  }

  startReview(r: Review, at: string, by: PersonaId, correlationId: CorrelationId): void {
    r.startedBy = by;
    this.reviewStatus(r, "in_review", at, by, "review.started", correlationId);
  }

  decide(
    r: Review,
    kind: ReviewDecisionKind,
    note: string,
    at: string,
    by: PersonaId,
    correlationId: CorrelationId,
  ): void {
    r.decision = { kind, note, decidedBy: by, decidedAt: at };
    r.decisionReason = note;
    r.reviewedAt = at;
    r.reviewedBy = by;
    this.reviewStatus(r, "action_recorded", at, by, "review.decided", correlationId, {
      decisionKind: kind,
    });
  }

  dismiss(
    r: Review,
    reasonCode: DismissReasonCode,
    reason: string,
    at: string,
    by: PersonaId,
    correlationId: CorrelationId,
  ): void {
    assertDismissalReason(reason);
    r.decision = { kind: "dismiss", note: reason, reasonCode, decidedBy: by, decidedAt: at };
    r.decisionReason = reason;
    r.reviewedAt = at;
    r.reviewedBy = by;
    this.reviewStatus(r, "dismissed_with_reason", at, by, "review.dismissed", correlationId, {
      decisionKind: "dismiss",
      reasonCode,
      reason,
    });
  }

  // ── Referrals ────────────────────────────────────────────────────────────
  referral(input: {
    n: number;
    review: Review;
    destinationFacilityId: FacilityId;
    at: string;
    dueAt: string;
    assignedWorkerId: PersonaId;
    referralReason: string;
    by: PersonaId;
    correlationId: CorrelationId;
  }): Referral {
    const { review } = input;
    const ref: Referral = {
      id: this.sid<ReferralId>(ID_NAMESPACES.referral, input.n),
      patientId: review.patientId,
      reviewId: review.id,
      destination: FACILITY_NAME.get(input.destinationFacilityId) ?? input.destinationFacilityId,
      requestedAt: input.at,
      dueAt: input.dueAt,
      status: "created",
      completedAt: null,
      completionEvidence: null,
      facilityId: review.facilityId,
      destinationFacilityId: input.destinationFacilityId,
      assignedWorkerId: input.assignedWorkerId,
      priority: review.priority,
      referralReason: input.referralReason,
      appointmentAt: null,
      cancelled: null,
      version: 1,
      createdAt: input.at,
      updatedAt: input.at,
      synthetic: true,
    };
    this.audit({
      action: "referral.created",
      entityType: "referral",
      entityId: ref.id,
      actorId: input.by,
      at: input.at,
      correlationId: input.correlationId,
      scope: this.scopeOf(ref),
      summary: {
        fromStatus: null,
        toStatus: "created",
        destinationFacilityId: input.destinationFacilityId,
      },
    });
    return ref;
  }

  private referralStatus(
    ref: Referral,
    to: Referral["status"],
    at: string,
    by: PersonaId,
    action: string,
    correlationId: CorrelationId,
    extra: { [key: string]: JsonValue } = {},
  ): void {
    referralMachine.assert(ref.status, to);
    const from = ref.status;
    this.touch(ref, at);
    ref.status = to;
    this.audit({
      action,
      entityType: "referral",
      entityId: ref.id,
      actorId: by,
      at,
      correlationId,
      scope: this.scopeOf(ref),
      summary: { fromStatus: from, toStatus: to, ...extra },
    });
  }

  accept(ref: Referral, at: string, by: PersonaId, correlationId: CorrelationId): void {
    this.referralStatus(ref, "accepted", at, by, "referral.accepted", correlationId);
  }

  schedule(
    ref: Referral,
    at: string,
    appointmentAt: string,
    by: PersonaId,
    correlationId: CorrelationId,
  ): void {
    ref.appointmentAt = appointmentAt;
    this.referralStatus(ref, "scheduled", at, by, "referral.scheduled", correlationId, {
      appointmentAt,
    });
  }

  completeReferral(
    ref: Referral,
    input: {
      at: string;
      type: CompletionEvidenceType;
      reference: string;
      outcome: ReferralOutcome;
      note: string;
      by: PersonaId;
    },
    correlationId: CorrelationId,
  ): void {
    ref.completionEvidence = {
      type: input.type,
      reference: input.reference,
      outcome: input.outcome,
      note: input.note,
      recordedBy: input.by,
      recordedAt: input.at,
    };
    ref.completedAt = input.at;
    assertCompletionEvidence(ref);
    this.referralStatus(ref, "completed", input.at, input.by, "referral.completed", correlationId, {
      evidenceType: input.type,
      outcome: input.outcome,
    });
  }

  cancelReferral(
    ref: Referral,
    reasonCode: ReferralCancelReasonCode,
    reason: string,
    at: string,
    by: PersonaId,
    correlationId: CorrelationId,
  ): void {
    assertCancellationReason(reason);
    ref.cancelled = { reasonCode, reason };
    this.referralStatus(ref, "cancelled_with_reason", at, by, "referral.cancelled", correlationId, {
      reasonCode,
    });
  }

  // ── Follow-ups ───────────────────────────────────────────────────────────
  followUp(input: {
    n: number;
    patientId: PatientId;
    facilityId: FacilityId;
    referralId: ReferralId | null;
    reviewId: ReviewId | null;
    purpose: FollowUpPurpose;
    workerId: PersonaId;
    at: string;
    dueAt: string;
    by: PersonaId;
    correlationId: CorrelationId;
  }): FollowUp {
    const fu: FollowUp = {
      id: this.sid<FollowUpId>(ID_NAMESPACES.followUp, input.n),
      patientId: input.patientId,
      referralId: input.referralId,
      reviewId: input.reviewId,
      facilityId: input.facilityId,
      assignedWorkerId: input.workerId,
      dueAt: input.dueAt,
      status: "assigned",
      attempts: [],
      completedAt: null,
      outcome: null,
      purpose: input.purpose,
      assignmentHistory: [
        { workerId: input.workerId, assignedAt: input.at, assignedBy: input.by, reason: null },
      ],
      notes: [],
      clinicianConfirmation: { status: "not_required" },
      version: 1,
      createdAt: input.at,
      updatedAt: input.at,
      synthetic: true,
    };
    this.audit({
      action: "followup.created",
      entityType: "follow_up",
      entityId: fu.id,
      actorId: input.by,
      at: input.at,
      correlationId: input.correlationId,
      scope: this.scopeOf(fu),
      summary: {
        fromStatus: null,
        toStatus: "assigned",
        purpose: input.purpose,
        assignedWorkerId: input.workerId,
      },
    });
    return fu;
  }

  private followUpStatus(
    fu: FollowUp,
    to: FollowUpStatus,
    at: string,
    by: PersonaId,
    action: string,
    correlationId: CorrelationId,
    extra: { [key: string]: JsonValue } = {},
    followUpAction: Parameters<typeof assertFollowUpTransition>[2] = "record_attempt",
  ): void {
    assertFollowUpTransition(fu, to, followUpAction);
    const from = fu.status;
    this.touch(fu, at);
    fu.status = to;
    this.audit({
      action,
      entityType: "follow_up",
      entityId: fu.id,
      actorId: by,
      at,
      correlationId,
      scope: this.scopeOf(fu),
      summary: { fromStatus: from, toStatus: to, ...extra },
    });
  }

  /** Records a contact attempt; a `reached` result on an open follow-up moves it to `contacted`. */
  attempt(
    fu: FollowUp,
    input: {
      at: string;
      method: ContactMethod;
      result: ContactResult;
      minutes: number;
      note: string;
      by: PersonaId;
    },
    correlationId: CorrelationId,
  ): void {
    this.attemptNo += 1;
    fu.attempts.push({
      id: this.sid<ContactAttemptId>(ID_NAMESPACES.attempt, this.attemptNo),
      at: input.at,
      method: input.method,
      result: input.result,
      note: input.note,
      durationMinutes: input.minutes,
      recordedBy: input.by,
    });
    const summary = { method: input.method, result: input.result, durationMinutes: input.minutes };
    if (input.result === "reached" && (fu.status === "assigned" || fu.status === "reassigned")) {
      this.followUpStatus(
        fu,
        "contacted",
        input.at,
        input.by,
        "followup.attempt_recorded",
        correlationId,
        summary,
      );
      return;
    }
    this.touch(fu, input.at);
    this.audit({
      action: "followup.attempt_recorded",
      entityType: "follow_up",
      entityId: fu.id,
      actorId: input.by,
      at: input.at,
      correlationId,
      scope: this.scopeOf(fu),
      summary,
    });
  }

  addNote(
    fu: FollowUp,
    text: string,
    at: string,
    by: PersonaId,
    correlationId: CorrelationId,
  ): void {
    this.touch(fu, at);
    fu.notes.push({ at, by, text });
    this.audit({
      action: "followup.note_added",
      entityType: "follow_up",
      entityId: fu.id,
      actorId: by,
      at,
      correlationId,
      scope: this.scopeOf(fu),
      summary: { noteLength: text.length },
    });
  }

  unableToReach(
    fu: FollowUp,
    reasonCode: UnableToReachReason,
    at: string,
    by: PersonaId,
    correlationId: CorrelationId,
  ): void {
    this.followUpStatus(fu, "unable_to_reach", at, by, "followup.unable_to_reach", correlationId, {
      reasonCode,
    });
  }

  reassign(
    fu: FollowUp,
    workerId: PersonaId,
    reason: string,
    at: string,
    by: PersonaId,
    correlationId: CorrelationId,
  ): void {
    fu.assignedWorkerId = workerId;
    fu.assignmentHistory.push({ workerId, assignedAt: at, assignedBy: by, reason });
    this.followUpStatus(
      fu,
      "reassigned",
      at,
      by,
      "followup.reassigned",
      correlationId,
      { assignedWorkerId: workerId },
      "reassign",
    );
  }

  completeFollowUp(
    fu: FollowUp,
    input: {
      at: string;
      kind: FollowUpOutcome;
      evidenceType: CompletionEvidenceType | null;
      note: string;
      by: PersonaId;
      confirmation: "pending" | "not_required";
    },
    correlationId: CorrelationId,
  ): void {
    fu.outcome = {
      kind: input.kind,
      occurredAt: input.at,
      evidenceType: input.evidenceType,
      reasonCode: null,
      note: input.note,
      recordedBy: input.by,
    };
    fu.completedAt = input.at;
    fu.clinicianConfirmation = { status: input.confirmation };
    assertCompletionEvidence(fu);
    this.followUpStatus(
      fu,
      "completed",
      input.at,
      input.by,
      "followup.completed",
      correlationId,
      {
        outcome: input.kind,
        evidenceType: input.evidenceType,
      },
      "record_outcome",
    );
  }

  confirmCompletion(fu: FollowUp, at: string, by: PersonaId, correlationId: CorrelationId): void {
    if (fu.status !== "completed" || fu.clinicianConfirmation.status !== "pending") {
      throw new Error("seed: confirmCompletion needs a completed follow-up awaiting confirmation");
    }
    this.touch(fu, at);
    fu.clinicianConfirmation = { status: "confirmed", by, at };
    this.audit({
      action: "followup.completion_confirmed",
      entityType: "follow_up",
      entityId: fu.id,
      actorId: by,
      at,
      correlationId,
      scope: this.scopeOf(fu),
      summary: { confirmation: "confirmed" },
    });
  }

  // ── Care tasks ───────────────────────────────────────────────────────────
  careTask<T extends CareTask>(task: T, correlationId: CorrelationId, action = "task.created"): T {
    this.audit({
      action,
      entityType: "care_task",
      entityId: task.id,
      actorId: task.createdBy,
      at: task.createdAt,
      correlationId,
      scope: {
        facilityId: task.facilityId,
        districtId:
          task.facilityId === null ? null : (FACILITY_TO_DISTRICT[task.facilityId] ?? null),
        patientId: task.patientId,
      },
      summary: { fromStatus: null, toStatus: task.status, kind: task.kind },
    });
    return task;
  }

  careTaskStatus(
    task: CareTask,
    to: CareTaskStatus,
    at: string,
    by: PersonaId,
    correlationId: CorrelationId,
  ): void {
    careTaskMachine.assert(task.status, to);
    const from = task.status;
    this.touch(task, at);
    task.status = to;
    if (to === "done") task.completedAt = at;
    this.audit({
      action: to === "in_progress" ? "task.started" : "task.completed",
      entityType: "care_task",
      entityId: task.id,
      actorId: by,
      at,
      correlationId,
      scope: {
        facilityId: task.facilityId,
        districtId:
          task.facilityId === null ? null : (FACILITY_TO_DISTRICT[task.facilityId] ?? null),
        patientId: task.patientId,
      },
      summary: { fromStatus: from, toStatus: to },
    });
  }

  // ── Citizen-facing ───────────────────────────────────────────────────────
  releaseInstruction(input: {
    n: number;
    patientId: PatientId;
    facilityId: FacilityId;
    kind: CareInstructionKind;
    source: { type: "review" | "referral" | "follow_up"; id: string };
    appointmentAt: string | null;
    at: string;
    by: PersonaId;
    correlationId: CorrelationId;
  }): CareInstruction {
    const ci: CareInstruction = {
      id: this.sid<CareInstructionId>(ID_NAMESPACES.careInstruction, input.n),
      patientId: input.patientId,
      kind: input.kind,
      sourceType: input.source.type,
      sourceId: input.source.id,
      messageKey: `citizen:nextStep.${input.kind}.message`,
      params: { facilityId: input.facilityId },
      appointmentAt: input.appointmentAt,
      facilityId: input.facilityId,
      releasedBy: input.by,
      releasedAt: input.at,
      status: "released",
      version: 1,
      createdAt: input.at,
      updatedAt: input.at,
      synthetic: true,
    };
    this.audit({
      action: "instruction.released",
      entityType: "care_instruction",
      entityId: ci.id,
      actorId: input.by,
      at: input.at,
      correlationId: input.correlationId,
      scope: this.scopeOf(ci),
      summary: {
        fromStatus: null,
        toStatus: "released",
        kind: input.kind,
        sourceType: input.source.type,
      },
    });
    return ci;
  }

  withdrawInstruction(
    ci: CareInstruction,
    at: string,
    by: PersonaId,
    correlationId: CorrelationId,
  ): void {
    if (ci.status !== "released")
      throw new Error("seed: only released instructions can be withdrawn");
    this.touch(ci, at);
    ci.status = "withdrawn";
    this.audit({
      action: "instruction.withdrawn",
      entityType: "care_instruction",
      entityId: ci.id,
      actorId: by,
      at,
      correlationId,
      scope: this.scopeOf(ci),
      summary: { fromStatus: "released", toStatus: "withdrawn" },
    });
  }

  reminder(input: {
    n: number;
    instruction: CareInstruction;
    followUpId: FollowUpId | null;
    createdAt: string;
    scheduledAt: string;
    correlationId: CorrelationId;
  }): Reminder {
    const { instruction } = input;
    const r: Reminder = {
      id: this.sid<ReminderId>(ID_NAMESPACES.reminder, input.n),
      patientId: instruction.patientId,
      followUpId: input.followUpId,
      channel: "in_app",
      consentBasis: "citizen_opt_in",
      scheduledAt: input.scheduledAt,
      status: "scheduled",
      instructionId: instruction.id,
      cancelReason: null,
      deliveredAt: null,
      acknowledgedAt: null,
      version: 1,
      createdAt: input.createdAt,
      updatedAt: input.createdAt,
      synthetic: true,
    };
    this.reminderEvent(
      r,
      "reminder.scheduled",
      null,
      "scheduled",
      input.createdAt,
      input.correlationId,
      instruction.facilityId,
    );
    return r;
  }

  deliverReminder(
    r: Reminder,
    at: string,
    correlationId: CorrelationId,
    facilityId: FacilityId,
  ): void {
    this.reminderTo(r, "delivered_simulated", at, correlationId, facilityId);
    r.deliveredAt = at;
  }

  acknowledgeReminder(
    r: Reminder,
    at: string,
    correlationId: CorrelationId,
    facilityId: FacilityId,
  ): void {
    this.reminderTo(r, "acknowledged", at, correlationId, facilityId);
    r.acknowledgedAt = at;
  }

  cancelReminder(
    r: Reminder,
    reason: ReminderCancelReason,
    at: string,
    correlationId: CorrelationId,
    facilityId: FacilityId,
  ): void {
    r.cancelReason = reason;
    this.reminderTo(r, "cancelled", at, correlationId, facilityId);
  }

  private reminderTo(
    r: Reminder,
    to: Reminder["status"],
    at: string,
    correlationId: CorrelationId,
    facilityId: FacilityId,
  ): void {
    const legal = REMINDER_TRANSITIONS[r.status];
    if (!legal.includes(to))
      throw new Error(`seed: illegal reminder transition ${r.status} → ${to}`);
    const from = r.status;
    this.touch(r, at);
    r.status = to;
    this.reminderEvent(r, `reminder.${to}`, from, to, at, correlationId, facilityId);
  }

  private reminderEvent(
    r: Reminder,
    action: string,
    from: string | null,
    to: string,
    at: string,
    correlationId: CorrelationId,
    facilityId: FacilityId,
  ): void {
    this.audit({
      action,
      entityType: "reminder",
      entityId: r.id,
      actorId: null,
      at,
      correlationId,
      scope: {
        facilityId,
        districtId: FACILITY_TO_DISTRICT[facilityId] ?? null,
        patientId: r.patientId,
      },
      summary: { fromStatus: from, toStatus: to, cancelReason: r.cancelReason },
    });
  }
}

/** Simulated reminder lifecycle (CTZ-05): delivery never transitions a referral or follow-up. */
export const REMINDER_TRANSITIONS: Readonly<
  Record<Reminder["status"], readonly Reminder["status"][]>
> = {
  scheduled: ["delivered_simulated", "cancelled"],
  delivered_simulated: ["acknowledged"],
  acknowledged: [],
  cancelled: [],
};
