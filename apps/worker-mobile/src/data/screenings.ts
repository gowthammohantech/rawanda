/**
 * Submitted screenings (HWM-06): `submitFromDraft()`, `get()`, `amend()` and the derived sync
 * view of one screening. Everything goes through the FND-07 repository:
 *
 * - `submitFromDraft(draftId)` re-checks the draft (author, facility, patient scope) and re-runs
 *   the form validation with the stored ruleset's entry ranges, then calls
 *   `repo.createScreening(input, key, { fromDraftId })` — ONE store transaction writes the
 *   screening (same id as the draft, natural idempotency), the `screening.submit` sync op
 *   (`dependsOnOpId` = the patient's pending `patient.register` op, if any), the
 *   `screening.submitted` audit (values + units, ruleset version, reason codes — no notes) and
 *   deletes the draft row. The idempotency key is derived from the draft id, so a second tap,
 *   a retry after a crash or a concurrent call yields the same screening and one op (T-04).
 * - The screening's value columns are never updated after insert: corrections go through
 *   `amend()` → `repo.amendScreening` (append-only `amendments[]`, `screening.amend` op with
 *   `baseVersion = screening.version`, audit `screening.amended` with the justification).
 *
 * The local flag is a PREVIEW until the simulated server acknowledges the create op; the
 * acknowledged snapshot (server-evaluated status + flag) is authoritative (`preview: false`).
 */
import {
  deriveSyncState,
  evaluateScreening,
  fnv1a64Hex,
  type AmendableScreeningField,
  type AmendableValue,
  type DemoRuleset,
  type EntitySyncState,
  type FacilityId,
  type FlagResult,
  type Patient,
  type Screening,
  type ScreeningEvaluationInput,
  type ScreeningStatus,
  type SyncOperation,
} from "@laif/domain";
import { RepositoryError, type CareRepository } from "@laif/repositories";

import {
  createScreeningFormSchema,
  draftToFormValues,
  parseGlucose,
  parseWholeNumber,
  SCREENING_FORM_FIELDS,
  toScreeningInput,
  type ScreeningFormField,
  type ScreeningFormValues,
} from "../features/screening/screeningSchema.ts";
import * as drafts from "./drafts.ts";
import * as patients from "./patients.ts";

type Scope = { workerId: string; facilityId: FacilityId };

// ── Submit ───────────────────────────────────────────────────────────────────

const GUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/iu;

/**
 * The submit idempotency key of a draft: the draft id itself (a platform UUID on device), or a
 * deterministic UUID-shaped hash of it for non-UUID ids (test id generators).
 */
export function submitKeyFor(draftId: string): string {
  if (GUID.test(draftId)) return draftId;
  const hex = `${fnv1a64Hex(`submit:${draftId}`)}${fnv1a64Hex(`submit#2:${draftId}`)}`;
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-4${hex.slice(13, 16)}-8${hex.slice(17, 20)}-${hex.slice(20, 32)}`;
}

export type SubmitOutcome =
  | { status: "submitted"; screening: Screening; replayed: boolean }
  | { status: "invalid"; fields: ScreeningFormField[] }
  | { status: "missing" }
  | { status: "denied" };

type SubmitRepo = Pick<
  CareRepository,
  "getScreening" | "getPatient" | "recordAuditEvent" | "getActiveRuleset" | "createScreening"
>;

/** Evaluation inputs of form values (BP pair, glucose with its unit + context). */
export function evaluationInputOf(values: ScreeningFormValues): ScreeningEvaluationInput {
  const glucose = parseGlucose(values.glucoseValue);
  return {
    systolic: parseWholeNumber(values.systolic),
    diastolic: parseWholeNumber(values.diastolic),
    glucoseValue: glucose,
    glucoseUnit: glucose === null ? null : values.glucoseUnit,
    glucoseContext: glucose === null ? null : values.glucoseContext,
  };
}

/** On-device flag preview of a draft with the stored demo ruleset (never authoritative). */
export function previewFlag(draft: Screening, ruleset: DemoRuleset): FlagResult {
  return evaluateScreening(evaluationInputOf(draftToFormValues(draft)), ruleset);
}

/** Fields of a draft that fail the review-gate validation (empty = valid). */
export function invalidDraftFields(
  draft: Screening,
  ruleset: Pick<DemoRuleset, "plausibility">,
  now: Date,
): ScreeningFormField[] {
  const parsed = createScreeningFormSchema({
    now: () => now,
    limits: ruleset.plausibility,
  }).safeParse(draftToFormValues(draft));
  if (parsed.success) return [];
  const bad = new Set(parsed.error.issues.map((issue) => String(issue.path[0])));
  return SCREENING_FORM_FIELDS.filter((field) => bad.has(field));
}

const inFlight = new Map<string, Promise<SubmitOutcome>>();

/**
 * Submits a draft (see header). A screening that already exists with the draft's id is returned
 * as-is (no new write); concurrent calls for one draft share one promise.
 */
export function submitFromDraft(
  repo: SubmitRepo,
  scope: Scope,
  draftId: string,
  now: Date,
): Promise<SubmitOutcome> {
  const running = inFlight.get(draftId);
  if (running !== undefined) return running;
  const promise = runSubmit(repo, scope, draftId, now).finally(() => inFlight.delete(draftId));
  inFlight.set(draftId, promise);
  return promise;
}

async function runSubmit(
  repo: SubmitRepo,
  scope: Scope,
  draftId: string,
  now: Date,
): Promise<SubmitOutcome> {
  const existing = await submittedById(repo, draftId);
  if (existing === "denied") return { status: "denied" };
  if (existing !== null) return { status: "submitted", screening: existing, replayed: true };

  const access = await drafts.get(repo, scope, draftId);
  if (access.status !== "ok") return access;
  const ruleset = await repo.getActiveRuleset();
  const fields = invalidDraftFields(access.draft, ruleset, now);
  if (fields.length > 0) return { status: "invalid", fields };

  const key = submitKeyFor(draftId);
  const input = toScreeningInput(draftToFormValues(access.draft), {
    patientId: access.draft.patientId,
    idempotencyKey: key,
    now: () => now,
    limits: ruleset.plausibility,
  });
  const result = await repo.createScreening(input, key, { fromDraftId: draftId });
  return { status: "submitted", screening: result.data, replayed: result.replayed };
}

async function submittedById(
  repo: Pick<CareRepository, "getScreening">,
  id: string,
): Promise<Screening | "denied" | null> {
  try {
    const row = await repo.getScreening(id);
    return row !== null && row.status !== "draft" ? row : null;
  } catch (error) {
    if (error instanceof RepositoryError && error.code === "FORBIDDEN") return "denied";
    throw error;
  }
}

// ── Read ─────────────────────────────────────────────────────────────────────

export type ScreeningAccess =
  | { status: "ok"; screening: Screening; patient: Patient }
  /** Still a draft (not submitted yet) → the form. */
  | { status: "draft"; draftId: string }
  | { status: "missing" }
  | { status: "denied" };

/** A submitted screening + its scope-checked patient (another facility → denied, audited). */
export async function get(
  repo: Pick<CareRepository, "getScreening" | "getPatient" | "recordAuditEvent">,
  { facilityId }: Pick<Scope, "facilityId">,
  screeningId: string,
): Promise<ScreeningAccess> {
  let screening: Screening | null;
  try {
    screening = await repo.getScreening(screeningId);
  } catch (error) {
    if (error instanceof RepositoryError && error.code === "FORBIDDEN") return { status: "denied" };
    throw error;
  }
  if (screening === null) return { status: "missing" };
  if (screening.status === "draft") return { status: "draft", draftId: screening.id };
  if (screening.facilityId !== facilityId) return { status: "denied" };
  const access = await patients.get(repo, facilityId, screening.patientId);
  if (access.status !== "ok") return { status: "denied" };
  return { status: "ok", screening, patient: access.patient };
}

// ── Sync view ────────────────────────────────────────────────────────────────

/** Server-side view of the create op: what the simulated server said about the screening. */
export type ScreeningSyncView = {
  state: EntitySyncState;
  /** The `screening.submit` op (null for records that came from the server, e.g. the seed). */
  createOp: SyncOperation | null;
  /** `screening.amend` ops, oldest first. */
  amendOps: SyncOperation[];
  /** When it was saved on this device (op time, else the record's creation). */
  savedAt: string;
  /** Send attempts of the create op. */
  attempts: number;
  /** Acknowledgement time of the create op (server event time), null until then. */
  syncedAt: string | null;
  /** True once the server has the screening (create op acknowledged, or server-sourced). */
  serverConfirmed: boolean;
  /** Server-derived status (`review_required` | `no_review_required`) once confirmed. */
  serverStatus: ScreeningStatus | null;
  /** Server flag once confirmed, else the device preview. */
  flag: FlagResult | null;
  /** The flag shown is the on-device preview (not yet confirmed by the server). */
  preview: boolean;
  /** A retryable failure is waiting for the next pass. */
  willRetry: boolean;
  /** The server refused the screening (`FORBIDDEN` / `VALIDATION_ERROR`); kept on the device. */
  rejected: boolean;
  /** An op on this screening is in conflict (`needs_resolution`) — HWM-09 decides. */
  needsDecision: boolean;
  /** The op to open in the Sync center (conflict or rejection), if any. */
  attentionOpId: string | null;
};

const isObject = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === "object" && !Array.isArray(value);

export function screeningSyncView(
  screening: Screening,
  allOps: readonly SyncOperation[],
): ScreeningSyncView {
  const ops = allOps
    .filter((op) => op.entityId === screening.id && op.entityType === "screening")
    .sort((a, b) => a.localSeq - b.localSeq);
  const createOp = ops.find((op) => op.opType === "create") ?? null;
  const amendOps = ops.filter((op) => op.opType === "update");
  const state = deriveSyncState(screening.id, ops);
  const acknowledged = createOp?.status === "acknowledged";
  const serverConfirmed = createOp === null || acknowledged;
  const snapshot =
    acknowledged && isObject(createOp.serverSnapshot) ? createOp.serverSnapshot : null;
  const snapshotStatus = snapshot?.["status"];
  const serverStatus: ScreeningStatus | null = !serverConfirmed
    ? null
    : snapshotStatus === "review_required" || snapshotStatus === "no_review_required"
      ? snapshotStatus
      : screening.status === "submitted"
        ? null
        : screening.status;
  const snapshotFlag = snapshot?.["flag"];
  const flag =
    serverConfirmed && isObject(snapshotFlag)
      ? (snapshotFlag as unknown as FlagResult)
      : screening.flag;
  const attention =
    ops.find((op) => op.status === "needs_resolution" || op.status === "conflict") ??
    ops.find((op) => op.status === "rejected") ??
    null;
  return {
    state,
    createOp,
    amendOps,
    savedAt: createOp?.createdAt ?? screening.createdAt,
    attempts: createOp?.attempts ?? 0,
    syncedAt: acknowledged ? createOp.updatedAt : null,
    serverConfirmed,
    serverStatus,
    flag,
    preview: !serverConfirmed,
    willRetry: ops.some((op) => op.status === "retryable_failure"),
    rejected: createOp?.status === "rejected",
    needsDecision: ops.some((op) => op.status === "needs_resolution" || op.status === "conflict"),
    attentionOpId: attention?.id ?? null,
  };
}

// ── Amend ────────────────────────────────────────────────────────────────────

export type AmendCall = {
  field: AmendableScreeningField;
  after: AmendableValue;
  reason: string;
};

/**
 * Appends one amendment (original values untouched): `screening.amend` op with
 * `baseVersion = screening.version`, audit `screening.amended` with the justification.
 */
export async function amend(
  repo: Pick<CareRepository, "amendScreening">,
  screening: Pick<Screening, "id" | "version">,
  call: AmendCall,
  key: string,
): Promise<Screening> {
  const result = await repo.amendScreening(
    {
      screeningId: screening.id,
      expectedVersion: screening.version,
      field: call.field,
      after: call.after,
      reason: call.reason,
    } as Parameters<CareRepository["amendScreening"]>[0],
    key,
  );
  return result.data;
}
