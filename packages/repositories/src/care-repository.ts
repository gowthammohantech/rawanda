/**
 * `CareRepository` — the one async API all four apps use (FND-07 task 2; tech spec §4 names kept).
 *
 * Decisions:
 * - Writes return `WriteResult<T>` (spec §4 lists `Promise<Screening>` but also requires
 *   `eventId / entityVersion / updatedAt / auditEventId`).
 * - The actor comes from `deps.getActor()` (never a parameter); the device-session status is
 *   re-read from the store on every call (revocation takes effect immediately).
 * - Every mutation is `method(input, idempotencyKey)`; `expectedVersion` lives inside the input.
 * - Filters are the FND-03 filter schemas' *input* shape (paging defaults applied here).
 *
 * Extension rule: app phases add domain services as new `services/*.ts` modules exposed on the
 * same repository object, reusing the write pipeline (`Engine.mutate`), with tests in the shared
 * contract suite. CTZ-01 adds `createCitizenRepository(deps)` (`@laif/repositories/citizen`) as a
 * projection over the same store, pipeline, faults and audit — not a second storage implementation.
 */
import type { ProgrammeMetrics } from "@laif/analytics";
import type { ActorContext } from "@laif/auth-demo";
import type {
  AccessGrant,
  AuditFilterSchema,
  CareTaskInputSchema,
  CareTaskUpdateInputSchema,
  ClientAuditInput,
  CorrectionRequestInputSchema,
  ExportRecordInputSchema,
  FollowUpFilterSchema,
  FollowUpInputSchema,
  FollowUpUpdateInputSchema,
  MetricsFilterSchema,
  Page,
  PatientFilterSchema,
  ReferralFilterSchema,
  ReferralInputSchema,
  ReferralTransitionInputSchema,
  RegisterPatientInputSchema,
  ReleaseCareInstructionInputSchema,
  ReminderPreferenceInputSchema,
  ReviewDecisionInputSchema,
  ReviewFilterSchema,
  ScreeningAmendmentInputSchema,
  ScreeningDraftInputSchema,
  ScreeningFilterSchema,
  ScreeningInputSchema,
  StartReviewInputSchema,
  TaskFilterSchema,
  TimeEntry,
  WriteResult,
} from "@laif/contracts";
import type {
  AppId,
  AuditEvent,
  CareInstruction,
  CareTask,
  Clock,
  ConflictResolution,
  DemoPersona,
  DemoRuleset,
  FollowUp,
  IdGenerator,
  JsonValue,
  Patient,
  PersonaId,
  Referral,
  Reminder,
  ReminderPreference,
  Review,
  Screening,
  SyncOpStatus,
  SyncOperation,
  DeviceSession,
} from "@laif/domain";
import type { ScenarioId, SeedDataset } from "@laif/mock-data";
import type { z } from "zod";

import type { MetricsRecordsResult } from "./services/metrics.ts";
import type { StoreAdapter } from "./store/store-adapter.ts";
import type { FaultConfig, FaultConfigPatch, FaultInjector } from "./transport/faults.ts";

export type PatientFilterInput = z.input<typeof PatientFilterSchema>;
export type ScreeningFilterInput = z.input<typeof ScreeningFilterSchema>;
export type ReviewFilterInput = z.input<typeof ReviewFilterSchema>;
export type ReferralFilterInput = z.input<typeof ReferralFilterSchema>;
export type FollowUpFilterInput = z.input<typeof FollowUpFilterSchema>;
export type TaskFilterInput = z.input<typeof TaskFilterSchema>;
export type AuditFilterInput = z.input<typeof AuditFilterSchema>;
export type MetricsFilterInput = z.input<typeof MetricsFilterSchema>;

/**
 * Mutation inputs are the FND-03 schemas' *input* (pre-default) shape. `idempotencyKey` may be
 * omitted (the `key` argument is used); when present it must equal `key`.
 */
export type MutationInput<S extends z.ZodType> =
  z.input<S> extends infer T
    ? T extends unknown
      ? Omit<T, "idempotencyKey"> & { idempotencyKey?: string }
      : never
    : never;

export type RegisterPatientCall = MutationInput<typeof RegisterPatientInputSchema>;
export type ScreeningDraftCall = MutationInput<typeof ScreeningDraftInputSchema>;
export type ScreeningCall = MutationInput<ScreeningInputSchema>;
export type ScreeningAmendmentCall = MutationInput<typeof ScreeningAmendmentInputSchema>;
export type StartReviewCall = MutationInput<typeof StartReviewInputSchema>;
export type ReviewDecisionCall = MutationInput<typeof ReviewDecisionInputSchema>;
export type ReferralCall = MutationInput<typeof ReferralInputSchema>;
export type ReferralTransitionCall = MutationInput<typeof ReferralTransitionInputSchema>;
export type FollowUpCall = MutationInput<typeof FollowUpInputSchema>;
export type FollowUpUpdateCall = MutationInput<typeof FollowUpUpdateInputSchema>;
export type CareTaskCall = MutationInput<typeof CareTaskInputSchema>;
export type CareTaskUpdateCall = MutationInput<typeof CareTaskUpdateInputSchema>;
export type CorrectionRequestCall = MutationInput<typeof CorrectionRequestInputSchema>;
export type ReminderPreferenceCall = MutationInput<typeof ReminderPreferenceInputSchema>;
export type ReleaseCareInstructionCall = MutationInput<typeof ReleaseCareInstructionInputSchema>;
export type ExportRecordCall = MutationInput<typeof ExportRecordInputSchema>;

export type PatientMatch = { patient: Patient; score: number };

export type ReviewDetail = {
  review: Review;
  screening: Screening | null;
  patient: Patient | null;
  referrals: Referral[];
  followUps: FollowUp[];
};

export type ReviewCounts = Record<"pending" | "urgent" | "overdue" | "assigned" | "all", number>;

export type SyncTrigger = "manual" | "manual_dev" | "auto" | "startup" | "online" | "interval";

/** One `sync.process()` run (persisted in `syncRuns`). */
export type SyncRun = {
  id: string;
  trigger: SyncTrigger;
  startedAt: string;
  finishedAt: string;
  offline: boolean;
  attempted: number;
  acknowledged: number;
  duplicates: number;
  retryableFailures: number;
  conflicts: number;
  rejected: number;
  blocked: number;
  version: number;
  createdAt: string;
  updatedAt: string;
  synthetic: true;
};

export type SyncStatus = {
  offline: boolean;
  deviceRevoked: boolean;
  processing: boolean;
  total: number;
  /** Not yet acknowledged and still to be sent (queued + sending + retryable + blocked). */
  pending: number;
  byStatus: Record<SyncOpStatus, number>;
  /** conflict + needs_resolution. */
  needsDecision: number;
  lastRun: SyncRun | null;
  /** `finishedAt` of the latest run that acknowledged at least one op. */
  lastSyncedAt: string | null;
};

export type SyncOpListFilter = {
  statuses?: SyncOpStatus[];
  entityId?: string;
};

export interface SyncApi {
  list(filter?: SyncOpListFilter): Promise<SyncOperation[]>;
  getStatus(): Promise<SyncStatus>;
  /** Single-flight: concurrent callers await the same run. */
  process(options?: { trigger?: SyncTrigger }): Promise<SyncRun>;
  /** `retryable_failure` (or `blocked_revoked` after restore) → `queued`, schedule cleared. */
  retryNow(opId: string): Promise<SyncOperation>;
  resolveConflict(
    opId: string,
    resolution: ConflictResolution,
    key: string,
    note?: string,
  ): Promise<WriteResult<SyncOperation>>;
  /** "Another actor edited this" on the simulated remote (incl. reassignment). */
  simulateRemoteEdit(
    entityType: string,
    id: string,
    patch: { [key: string]: JsonValue },
  ): Promise<{ entityType: string; id: string; version: number }>;
  revokeDevice(): Promise<void>;
  restoreDevice(): Promise<void>;
}

export type DemoState = {
  seedVersion: string | null;
  datasetHash: string;
  scenarioId: ScenarioId | null;
  clockIso: string;
  pendingSyncCount: number;
};

export interface DemoApi {
  /** Seeds on first run only (meta `seedVersion` absent or different). */
  ensureSeeded(): Promise<{ seeded: boolean }>;
  resetDemo(): Promise<DemoState>;
  loadScenario(id: string): Promise<DemoState>;
  getDemoState(): Promise<DemoState>;
  setFaults(cfg: FaultConfigPatch): Promise<FaultConfig>;
  getFaults(): Promise<FaultConfig>;
  /** Demo time travel (persisted as an offset in meta). Returns the new clock ISO. */
  advanceClock(ms: number): Promise<string>;
  resetClock(): Promise<string>;
  /** Web WF-02 "another actor": bumps the entity version as `actorPersonaId (simulated)`. */
  simulateExternalUpdate(
    entityType: string,
    id: string,
    patch: { [key: string]: JsonValue },
    actorPersonaId: string,
  ): Promise<{ entityType: string; id: string; version: number }>;
}

export type StartDeviceSessionCall = {
  personaId: string;
  facilityId: string;
  deviceId: string;
};

/** Device identity + demo device sessions (HWM-01). Demo sign-in — not authentication. */
export interface DeviceApi {
  /** Store meta `device_id`, created on first call (platform UUID); cleared only by a reset. */
  getOrCreateDeviceId(): Promise<string>;
  getSession(id: string): Promise<DeviceSession | null>;
  /**
   * Scope-checked (`checkAccess`, `patient.read` on the facility) — denial audits
   * `access.denied` and throws `FORBIDDEN` (`ROLE` / `SCOPE`); success audits `session.started`.
   */
  startSession(i: StartDeviceSessionCall): Promise<DeviceSession>;
  /** `active` → `ended` + `session.ended`; touches nothing else. Null when unknown. */
  endSession(id: string): Promise<DeviceSession | null>;
}

export interface CareRepository {
  listPatients(f?: PatientFilterInput): Promise<Page<Patient>>;
  getPatient(id: string): Promise<Patient | null>;
  registerPatient(i: RegisterPatientCall, key: string): Promise<WriteResult<Patient>>;
  /** HWM-04: candidates in scope with score ≥ 0.5, best first (`scorePatientMatch`). */
  findPatientMatches(i: RegisterPatientCall): Promise<PatientMatch[]>;
  listScreenings(f?: ScreeningFilterInput): Promise<Page<Screening>>;
  getScreening(id: string): Promise<Screening | null>;
  /** Device-local: never enqueued for sync. */
  saveScreeningDraft(i: ScreeningDraftCall, key: string): Promise<WriteResult<Screening>>;
  discardScreeningDraft(id: string, key: string): Promise<WriteResult<Screening>>;
  /** Submit + evaluate (stored ruleset) + create a pending Review if flagged. */
  createScreening(i: ScreeningCall, key: string): Promise<WriteResult<Screening>>;
  amendScreening(i: ScreeningAmendmentCall, key: string): Promise<WriteResult<Screening>>;
  listReviews(f?: ReviewFilterInput): Promise<Page<Review>>;
  getReview(id: string): Promise<ReviewDetail | null>;
  countReviews(f?: ReviewFilterInput): Promise<ReviewCounts>;
  countReferrals(f?: ReferralFilterInput): Promise<Record<string, number>>;
  countFollowUps(f?: FollowUpFilterInput): Promise<Record<string, number>>;
  listWorkers(facilityId: string): Promise<DemoPersona[]>;
  startReview(i: StartReviewCall, key: string): Promise<WriteResult<Review>>;
  decideReview(i: ReviewDecisionCall, key: string): Promise<WriteResult<Review>>;
  listReferrals(f?: ReferralFilterInput): Promise<Page<Referral>>;
  createReferral(i: ReferralCall, key: string): Promise<WriteResult<Referral>>;
  transitionReferral(i: ReferralTransitionCall, key: string): Promise<WriteResult<Referral>>;
  listFollowUps(f?: FollowUpFilterInput): Promise<Page<FollowUp>>;
  createFollowUp(i: FollowUpCall, key: string): Promise<WriteResult<FollowUp>>;
  updateFollowUp(i: FollowUpUpdateCall, key: string): Promise<WriteResult<FollowUp>>;
  listTasks(f?: TaskFilterInput): Promise<Page<CareTask>>;
  createTask(i: CareTaskCall, key: string): Promise<WriteResult<CareTask>>;
  updateTask(i: CareTaskUpdateCall, key: string): Promise<WriteResult<CareTask>>;
  /** Creates a `correction_request` task; never edits the clinical record (WF-04.4). */
  requestCorrection(i: CorrectionRequestCall, key: string): Promise<WriteResult<CareTask>>;
  listReminders(patientId: string): Promise<Reminder[]>;
  setReminderPreference(
    i: ReminderPreferenceCall,
    key: string,
  ): Promise<WriteResult<ReminderPreference>>;
  listCareInstructions(patientId: string): Promise<CareInstruction[]>;
  releaseCareInstruction(
    i: ReleaseCareInstructionCall,
    key: string,
  ): Promise<WriteResult<CareInstruction>>;
  getAggregateMetrics(f?: MetricsFilterInput): Promise<ProgrammeMetrics>;
  /**
   * ADM-02: scoped metric source rows for the admin metric layer (`metrics.read`, aggregate
   * scope; patients reduced to non-identifying fields) + demo-clock `asOf` and `lastWriteAt`.
   */
  getMetricsRecords(f?: MetricsFilterInput): Promise<MetricsRecordsResult>;
  /** ADM-02: self-reported demo `TimeEntry` rows in the actor's scope (`metrics.read`). */
  listTimeEntries(f?: MetricsFilterInput): Promise<TimeEntry[]>;
  /** ADM-02: latest write to a metric source (stale-data chip); `metrics.read`. */
  getMetricsFreshness(): Promise<{ lastWriteAt: string | null }>;
  recordExport(i: ExportRecordCall, key: string): Promise<WriteResult<AuditEvent>>;
  listAuditEvents(f?: AuditFilterInput): Promise<Page<AuditEvent>>;
  /** UI-originated access / session / demo events only (registry `client: true`). */
  recordAuditEvent(i: ClientAuditInput): Promise<AuditEvent>;
  /**
   * ADM-01: the demo AccessGrants (reporting scope of each admin persona), ordered by persona.
   * Readable without a session: the demo sign-in shows every persona's scope, and grants hold no
   * patient data. ADM-08 adds the grant edits.
   */
  listAccessGrants(): Promise<AccessGrant[]>;
  sync: SyncApi;
  demo: DemoApi;
  device: DeviceApi;
}

export type RepositoryDeps = {
  store: StoreAdapter;
  /** Demo clock; `advanceBy` / `reset` (DemoClock) are used by `demo.advanceClock/resetClock`. */
  clock: Clock;
  ids: IdGenerator;
  getActor: () => ActorContext | null;
  appId: AppId;
  /** Overrides the ruleset stored with the dataset (tests only); the stored one is the default. */
  ruleset?: DemoRuleset;
  // ── ext (optional) ──
  /** Sync queue + simulated remote (default: `appId === 'worker'`). */
  sync?: boolean;
  /** PRNG seed of the fault injector (default 20261014). */
  faultSeed?: number;
  /** Shared injector (tests); default one is created from `faultSeed`. */
  faults?: FaultInjector;
  /** Latency sleep (default `setTimeout`); tests pass a no-op. */
  sleep?: (ms: number) => Promise<void>;
  /** Seed factory (default `createSeed()`). */
  seed?: () => SeedDataset;
  /** Worker slice persona when no worker actor is signed in (default FND-05 CHW Alpha-1 A). */
  slicePersonaId?: PersonaId;
};
