/**
 * `CitizenRepository` (CTZ-01) — the wallet's ONLY data API: a patient-visible projection /
 * facade over the FND-07 store, write pipeline, simulated transport and audit (no second storage
 * stack, no SQL, no `ctz_*` tables — the logical `ctz_*` names map onto FND collections, see
 * phases/04-citizen-wallet/CTZ-01 task 2).
 *
 * Rules every method enforces:
 * - The actor is the signed-in demo persona (`deps.getActor()`, role `citizen`).
 * - Health-data reads need an ACTIVE `patientLinks` record for the persona AND current consent
 *   `granted` for that patient; otherwise `FORBIDDEN` reason `SCOPE` / `CONSENT_REQUIRED` and one
 *   `access.denied` audit event (written after the rollback).
 * - Only released results, value-less pending placeholders and approved instructions are
 *   reachable (`@laif/domain` visibility selectors); the wallet never mutates clinical fields.
 * - Writes go through the FND-07 pipeline: one transaction, idempotent replay with the same key,
 *   `expectedVersion` → `CONFLICT` with `latest`, audit with correlation ID, `WriteResult<T>`.
 */
import type {
  AcknowledgeInstructionInputSchema,
  CallbackRequestInputSchema,
  CitizenAccessEvent,
  CitizenAccount,
  CitizenCareTask,
  CitizenSettings,
  ConsentRecord,
  ConsentStatus,
  CorrectionRequest,
  CorrectionRequestInputSchema,
  IdentityVerification,
  NextStepAcknowledgement,
  NotificationPreference,
  PatientLink,
  PatientLinkRelationship,
  RecordConsentInputSchema,
  TimelineItem,
  UpdateCitizenSettingsInputSchema,
  UpdateNotificationPrefsInputSchema,
  VerifyIdentityInputSchema,
  WriteResult,
} from "@laif/contracts";
import type {
  ApprovedInstruction,
  CitizenObservationItem,
  ConsentState,
  PatientId,
  PersonaId,
  ReleasedObservation,
  Reminder,
} from "@laif/domain";

import type { DemoApi, MutationInput, RepositoryDeps } from "../care-repository.ts";

export type RecordConsentCall = MutationInput<typeof RecordConsentInputSchema>;
export type AcknowledgeInstructionCall = MutationInput<typeof AcknowledgeInstructionInputSchema>;
export type UpdateNotificationPrefsCall = MutationInput<typeof UpdateNotificationPrefsInputSchema>;
export type CitizenCorrectionCall = MutationInput<typeof CorrectionRequestInputSchema>;
export type CallbackRequestCall = MutationInput<typeof CallbackRequestInputSchema>;
export type UpdateCitizenSettingsCall = MutationInput<typeof UpdateCitizenSettingsInputSchema>;
export type VerifyIdentityCall = MutationInput<typeof VerifyIdentityInputSchema>;

/** CTZ-02: `personaSelected` also records `citizen.persona.selected` (persona picker). */
export type StartCitizenSessionOptions = { personaSelected?: boolean };

/** CTZ-02 route-guard denial (no data read happened; audit only). */
export type GuardDenialCall = { patientId: string; route: string };

/** One linked patient as the persona picker / session sees it (no health data). */
export type CitizenLinkedPatient = {
  patientId: PatientId;
  displayName: string;
  relationship: PatientLinkRelationship;
  consentState: ConsentState;
};

/** Persona picker entry (CTZ-02). Demo persona — role switching is not real sign-in. */
export type CitizenPersonaSummary = {
  personaId: PersonaId;
  displayName: string;
  /** `CTZ-P1` … `CTZ-P5`. */
  citizenCode: string | null;
  accountId: string | null;
  accountStatus: CitizenAccount["status"] | null;
  verificationStatus: IdentityVerification["status"] | null;
  patients: CitizenLinkedPatient[];
};

/** The signed-in citizen's wallet session. */
export type CitizenSession = {
  personaId: PersonaId;
  displayName: string;
  account: CitizenAccount | null;
  verification: IdentityVerification | null;
  links: PatientLink[];
  patients: CitizenLinkedPatient[];
  /** First linked patient (the wallet shows one patient at a time); null when none. */
  activePatientId: PatientId | null;
};

export interface CitizenRepository {
  /** The five citizen demo personas with account / link / consent state (no actor needed). */
  listPersonas(): Promise<CitizenPersonaSummary[]>;
  /** Session of the signed-in persona; null when signed out or not a citizen. */
  getSession(): Promise<CitizenSession | null>;
  /** Records `session.started` (and `citizen.persona.selected` when chosen in the picker) for
   * the signed-in persona and returns its session. */
  startSession(options?: StartCitizenSessionOptions): Promise<CitizenSession>;
  /** Records `session.ended` for the signed-in persona (call BEFORE clearing the persona). */
  endSession(): Promise<{ personaId: PersonaId } | null>;
  /**
   * Simulated identity verification (CTZ-02, never a real check): the demo code verifies the
   * account (`active`); a wrong code is a recorded attempt (`failed`, `locked` after
   * `MAX_VERIFICATION_ATTEMPTS`) — both return the updated record. `DEPENDENCY_UNAVAILABLE`
   * (fault injector) changes nothing and audits `citizen.identity.verification_unavailable`.
   * Replays with the same key return the first outcome (T-09).
   */
  verifyIdentity(i: VerifyIdentityCall, key: string): Promise<WriteResult<IdentityVerification>>;
  /** `access.denied` (`CONSENT_REQUIRED`) when the wallet route guard blocks a health route. */
  recordGuardDenial(i: GuardDenialCall): Promise<void>;
  /** Consent of a linked patient (link required; works while consent is withdrawn). */
  getConsent(patientId: string): Promise<ConsentStatus>;
  /** Appends a consent record, mirrors `Patient.consentState`; withdrawal cancels scheduled
   * reminders (`consent_withdrawn`) and never deletes clinical records. */
  recordConsent(i: RecordConsentCall, key: string): Promise<WriteResult<ConsentRecord>>;
  listReleasedObservations(patientId: string): Promise<CitizenObservationItem[]>;
  /**
   * CTZ-03: the results list was shown (once per screen focus) — one `record_viewed` access
   * event + `citizen.result.list_viewed` audit. Link + consent required.
   */
  recordResultsListViewed(patientId: string): Promise<void>;
  /**
   * A released result (`NOT_FOUND` for pending / unknown); writes `citizen.result.viewed`
   * (de-duplicated per persona + result per demo minute). A result id of ANOTHER patient
   * (cross-patient deep link, T-02) → `FORBIDDEN` `SCOPE` + one `access.denied`, no data.
   */
  getObservation(id: string, patientId: string): Promise<ReleasedObservation>;
  listApprovedInstructions(patientId: string): Promise<ApprovedInstruction[]>;
  /** "I have read this" — one ack per instruction; replays return the same ack. */
  acknowledgeInstruction(
    i: AcknowledgeInstructionCall,
    key: string,
  ): Promise<WriteResult<NextStepAcknowledgement>>;
  getNotificationPrefs(patientId: string): Promise<NotificationPreference | null>;
  /** Opt in / out + timing; opting out cancels scheduled reminders (`opted_out`). */
  updateNotificationPrefs(
    i: UpdateNotificationPrefsCall,
    key: string,
  ): Promise<WriteResult<NotificationPreference>>;
  listReminders(patientId: string): Promise<Reminder[]>;
  /** Derived progress timeline, newest first (reminders are never `done`). */
  listTimeline(patientId: string): Promise<TimelineItem[]>;
  /** Citizen-visible access history, newest first. */
  listAccessEvents(patientId: string): Promise<CitizenAccessEvent[]>;
  /** Creates a `correction_request` care task; the record itself is never changed. */
  createCorrectionRequest(
    i: CitizenCorrectionCall,
    key: string,
  ): Promise<WriteResult<CitizenCareTask>>;
  listCorrectionRequests(patientId: string): Promise<CorrectionRequest[]>;
  /** Creates a `callback_request` care task (support stub; link required, not consent). */
  createCallbackRequest(i: CallbackRequestCall, key: string): Promise<WriteResult<CitizenCareTask>>;
  /** Settings of the signed-in persona (null before the first save). */
  getSettings(): Promise<CitizenSettings | null>;
  updateSettings(i: UpdateCitizenSettingsCall, key: string): Promise<WriteResult<CitizenSettings>>;
  /** FND-07 demo API (`resetDemo` reseeds the citizen slice incl. overlay); never faulted. */
  demo: DemoApi;
}

/** Same deps as `createCareRepository`; `appId` is always `citizen` and there is no sync. */
export type CitizenRepositoryDeps = Omit<
  RepositoryDeps,
  "appId" | "sync" | "slicePersonaId" | "ruleset"
> & { appId?: "citizen" };
