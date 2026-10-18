/**
 * Sync center data (HWM-09 tasks 5–7): the FND-07 op queue grouped the way the worker reads it,
 * one op's detail with its audit trail, and the conflict comparison. Everything is read from
 * this device (`repo.sync.*`, scoped lists); "now" is the repository's demo clock.
 *
 * | Section               | Op statuses                                              |
 * |-----------------------|----------------------------------------------------------|
 * | Needs your decision   | `conflict`, `needs_resolution`                           |
 * | Waiting to sync       | `queued`, `sending`, `retryable_failure`, `blocked_revoked` |
 * | Not accepted          | `rejected` (kept on the device)                          |
 * | Synced recently       | last 20 `acknowledged` / `superseded` (newest first)     |
 *
 * Free-text notes in payloads are never shown (payload summaries list field names / coded
 * values only).
 */
import type {
  AuditEvent,
  FacilityId,
  FollowUp,
  JsonValue,
  Patient,
  Screening,
  SyncOpStatus,
  SyncOperation,
} from "@laif/domain";
import type { CareRepository, SyncStatus } from "@laif/repositories";

import { retryView, type RetryView } from "../sync/scheduler.ts";
import { describeSyncOp, type SyncOpLabel } from "./opLabel.ts";
import { listByIds } from "./patients.ts";

export const SYNCED_RECENT_LIMIT = 20;

export const SECTION_STATUSES = {
  decision: ["conflict", "needs_resolution"],
  waiting: ["queued", "sending", "retryable_failure", "blocked_revoked"],
  notAccepted: ["rejected"],
  synced: ["acknowledged", "superseded"],
} as const satisfies Record<string, readonly SyncOpStatus[]>;
export type SyncSection = keyof typeof SECTION_STATUSES;
export const SYNC_SECTIONS = ["decision", "waiting", "notAccepted", "synced"] as const;

/** Why the server did not accept an op (plain-language explanation per kind). */
export const REJECTION_KINDS = [
  "validation",
  "forbidden",
  "reassigned",
  "not_found",
  "revoked",
] as const;
export type RejectionKind = (typeof REJECTION_KINDS)[number];

/** Error codes shown in plain words (`worker:sync.error.<code>`). */
export const SYNC_ERROR_CODES = [
  "VALIDATION_ERROR",
  "FORBIDDEN",
  "NOT_FOUND",
  "CONFLICT",
  "DEPENDENCY_UNAVAILABLE",
  "TIMEOUT",
  "OFFLINE",
  "INTERNAL",
] as const;
export type SyncErrorCode = (typeof SYNC_ERROR_CODES)[number];

export function errorCodeOf(op: Pick<SyncOperation, "lastError">): SyncErrorCode | null {
  const code = op.lastError?.code;
  return code !== undefined && (SYNC_ERROR_CODES as readonly string[]).includes(code)
    ? (code as SyncErrorCode)
    : null;
}

export function rejectionKind(op: Pick<SyncOperation, "status" | "lastError">): RejectionKind {
  const error = op.lastError;
  if (error?.code === "FORBIDDEN") {
    if (error.reason === "TASK_REASSIGNED") return "reassigned";
    if (error.reason === "DEVICE_REVOKED" || error.reason === "SESSION_REVOKED") return "revoked";
    return "forbidden";
  }
  if (error?.code === "NOT_FOUND") return "not_found";
  return "validation";
}

export type SyncOpRow = {
  op: SyncOperation;
  label: SyncOpLabel;
  /** Created by a re-apply resolution (`resolvesOpId`). */
  resolution: boolean;
  /** Superseded by a re-applied op (not withdrawn by "keep latest"). */
  replaced: boolean;
  patientName: string | null;
  retry: RetryView;
  errorCode: SyncErrorCode | null;
  rejection: RejectionKind | null;
  /** Short form of the server event id of the acknowledgement (Synced recently). */
  serverEventShort: string | null;
};

export type SyncCenterData = {
  nowIso: string;
  status: SyncStatus;
  sections: Record<SyncSection, SyncOpRow[]>;
  /** Waiting + needs decision (Sync tab badge). */
  badgeCount: number;
};

type CenterRepo = Pick<
  CareRepository,
  "sync" | "demo" | "listFollowUps" | "listScreenings" | "listPatients"
>;

const asRecord = (value: JsonValue | null | undefined): Record<string, JsonValue> | null =>
  value !== null && value !== undefined && typeof value === "object" && !Array.isArray(value)
    ? value
    : null;

const stringField = (value: JsonValue | null | undefined, field: string): string | null => {
  const record = asRecord(value);
  const raw = record?.[field];
  return typeof raw === "string" ? raw : null;
};

/** The patient an op is about (patient create, screening, follow-up), if known on the device. */
export function patientIdOfOp(
  op: Pick<SyncOperation, "entityType" | "entityId" | "payload">,
  followUps: ReadonlyMap<string, Pick<FollowUp, "patientId">>,
  screenings: ReadonlyMap<string, Pick<Screening, "patientId">>,
): string | null {
  switch (op.entityType) {
    case "patient":
      return op.entityId;
    case "screening":
      return stringField(op.payload, "patientId") ?? screenings.get(op.entityId)?.patientId ?? null;
    case "follow_up":
      return followUps.get(op.entityId)?.patientId ?? null;
    case "care_task":
      return stringField(op.payload, "patientId");
    default:
      return null;
  }
}

/** `3F2A9C1B` — first 8 hex characters of an id. */
export const shortId = (id: string): string =>
  id
    .replace(/[^0-9a-z]/giu, "")
    .slice(0, 8)
    .toUpperCase();

const newestFirst = (a: SyncOperation, b: SyncOperation) =>
  a.updatedAt === b.updatedAt ? b.localSeq - a.localSeq : a.updatedAt < b.updatedAt ? 1 : -1;

async function lookups(repo: CenterRepo, facilityId: FacilityId, ops: readonly SyncOperation[]) {
  const [followUps, screenings] = await Promise.all([
    repo.listFollowUps({ pageSize: 200 }).then((page) => page.items),
    repo.listScreenings({ pageSize: 200 }).then((page) => page.items),
  ]);
  const followUpById = new Map(followUps.map((f) => [f.id as string, f]));
  const screeningById = new Map(screenings.map((s) => [s.id as string, s]));
  const patientIds = new Set<string>();
  for (const op of ops) {
    const id = patientIdOfOp(op, followUpById, screeningById);
    if (id !== null) patientIds.add(id);
  }
  const patients = await listByIds(repo, facilityId, [...patientIds]);
  const patientById = new Map(patients.map((p: Patient) => [p.id as string, p]));
  return { followUpById, screeningById, patientById };
}

export async function loadSyncCenter(
  repo: CenterRepo,
  facilityId: FacilityId,
): Promise<SyncCenterData> {
  const [ops, status, demo] = await Promise.all([
    repo.sync.list(),
    repo.sync.getStatus(),
    repo.demo.getDemoState(),
  ]);
  const nowMs = Date.parse(demo.clockIso);
  const { followUpById, screeningById, patientById } = await lookups(repo, facilityId, ops);

  const byStatus = (statuses: readonly SyncOpStatus[]) =>
    ops.filter((op) => statuses.includes(op.status));
  const synced = byStatus(SECTION_STATUSES.synced).sort(newestFirst).slice(0, SYNCED_RECENT_LIMIT);
  const acks = await repo.sync.history(synced.map((op) => op.id));
  const serverEvent = new Map<string, string>();
  for (const event of acks) {
    if (event.action !== "sync.op_acknowledged") continue;
    const opId = stringField(event.changeSummary, "opId");
    const eventId = stringField(event.changeSummary, "serverEventId");
    if (opId !== null && eventId !== null) serverEvent.set(opId, shortId(eventId));
  }

  const reappliedOriginals = new Set(
    ops.flatMap((o) => (o.resolvesOpId === null ? [] : [o.resolvesOpId as string])),
  );
  const row = (op: SyncOperation): SyncOpRow => {
    const described = describeSyncOp(op);
    const patientId = patientIdOfOp(op, followUpById, screeningById);
    return {
      op,
      label: described.label,
      resolution: described.resolution,
      replaced: op.status === "superseded" && reappliedOriginals.has(op.id),
      patientName: patientId === null ? null : (patientById.get(patientId)?.displayName ?? null),
      retry: retryView(op, nowMs),
      errorCode: errorCodeOf(op),
      rejection: op.status === "rejected" ? rejectionKind(op) : null,
      serverEventShort: serverEvent.get(op.id) ?? null,
    };
  };

  const sections: Record<SyncSection, SyncOpRow[]> = {
    decision: byStatus(SECTION_STATUSES.decision).map(row),
    waiting: byStatus(SECTION_STATUSES.waiting).map(row),
    notAccepted: byStatus(SECTION_STATUSES.notAccepted).sort(newestFirst).map(row),
    synced: synced.map(row),
  };
  return {
    nowIso: demo.clockIso,
    status,
    sections,
    badgeCount: sections.waiting.length + sections.decision.length,
  };
}

// ── Op detail ──────────────────────────────────────────────────────────────

/** Payload fields never shown (free text). */
const FREE_TEXT_FIELDS = new Set(["note", "reason", "observations", "justification"]);
/** Internal fields that add nothing to the summary. */
const HIDDEN_FIELDS = new Set(["idempotencyKey"]);

export type PayloadSummaryItem = { field: string; value: string | null; hidden: boolean };

/** Field-by-field summary of an op payload: coded / numeric values shown, free text withheld. */
export function payloadSummary(payload: JsonValue): PayloadSummaryItem[] {
  const record = asRecord(payload);
  if (record === null) return [];
  return Object.entries(record)
    .filter(([field]) => !HIDDEN_FIELDS.has(field))
    .map(([field, value]) => {
      if (FREE_TEXT_FIELDS.has(field)) {
        return { field, value: null, hidden: typeof value === "string" && value.trim() !== "" };
      }
      if (value === null) return { field, value: null, hidden: false };
      if (typeof value === "object") {
        return { field, value: Array.isArray(value) ? `[${value.length}]` : "{…}", hidden: false };
      }
      return { field, value: String(value), hidden: false };
    })
    .filter((item) => item.value !== null || item.hidden);
}

export type OpDetailData = {
  nowIso: string;
  row: SyncOpRow;
  /** Audit trail of the op (and of the ops it led to / came from), oldest first. */
  history: AuditEvent[];
  payload: PayloadSummaryItem[];
  /** The op this one re-applied (`resolvesOpId`). */
  resolves: SyncOperation | null;
  /** Ops created by resolving this one (re-applied op / resolution notice). */
  resolvedBy: SyncOperation[];
};

export async function loadOpDetail(
  repo: CenterRepo,
  facilityId: FacilityId,
  opId: string,
): Promise<OpDetailData | null> {
  const [ops, demo] = await Promise.all([repo.sync.list(), repo.demo.getDemoState()]);
  const op = ops.find((o) => o.id === opId);
  if (op === undefined) return null;
  const resolvedBy = ops.filter(
    (o) => o.resolvesOpId === op.id || (o.entityType === "sync_operation" && o.entityId === op.id),
  );
  const related = [op.id, ...resolvedBy.map((o) => o.id)];
  const [history, { followUpById, screeningById, patientById }] = await Promise.all([
    repo.sync.history(related),
    lookups(repo, facilityId, [op]),
  ]);
  const described = describeSyncOp(op);
  const patientId = patientIdOfOp(op, followUpById, screeningById);
  let serverEventShort: string | null = null;
  for (const event of history) {
    if (
      event.action === "sync.op_acknowledged" &&
      stringField(event.changeSummary, "opId") === op.id
    ) {
      const eventId = stringField(event.changeSummary, "serverEventId");
      if (eventId !== null) serverEventShort = shortId(eventId);
    }
  }
  return {
    nowIso: demo.clockIso,
    row: {
      op,
      label: described.label,
      resolution: described.resolution,
      replaced: op.status === "superseded" && ops.some((o) => o.resolvesOpId === op.id),
      patientName: patientId === null ? null : (patientById.get(patientId)?.displayName ?? null),
      retry: retryView(op, Date.parse(demo.clockIso)),
      errorCode: errorCodeOf(op),
      rejection: op.status === "rejected" ? rejectionKind(op) : null,
      serverEventShort,
    },
    history,
    payload: payloadSummary(op.payload),
    resolves: op.resolvesOpId === null ? null : (ops.find((o) => o.id === op.resolvesOpId) ?? null),
    resolvedBy,
  };
}

/** Plain-text copy of a rejected op for the supervisor (ids and codes only, no free text). */
export function rejectionDetailsText(row: SyncOpRow): string {
  const { op } = row;
  return [
    `op: ${op.id}`,
    `type: ${row.label}`,
    `entity: ${op.entityType} ${op.entityId}`,
    `idempotencyKey: ${op.idempotencyKey}`,
    `seq: ${op.localSeq}`,
    `baseVersion: ${op.baseVersion ?? "-"}`,
    `error: ${op.lastError?.code ?? "-"}${op.lastError?.reason ? ` / ${op.lastError.reason}` : ""}`,
    `correlation: ${op.correlationId}`,
    `savedAt: ${op.deviceTimestamp}`,
  ].join("\n");
}

// ── Conflict comparison ────────────────────────────────────────────────────

export type ConflictData = {
  op: SyncOperation;
  label: SyncOpLabel;
  patientName: string | null;
  /** The device copy (with this worker's update applied locally). */
  local: Record<string, JsonValue> | null;
  /** The server copy that came back with the conflict. */
  latest: Record<string, JsonValue> | null;
  /** From the `conflict.detected` audit (who / when changed it on the server). */
  changedBy: string | null;
  changedAt: string | null;
};

type ConflictRepo = CenterRepo;

export async function loadConflict(
  repo: ConflictRepo,
  facilityId: FacilityId,
  opId: string,
): Promise<ConflictData | null> {
  const ops = await repo.sync.list();
  const op = ops.find((o) => o.id === opId);
  if (op === undefined) return null;
  const [history, { followUpById, screeningById, patientById }] = await Promise.all([
    repo.sync.history(op.id),
    lookups(repo, facilityId, [op]),
  ]);
  const detected = history.filter((e) => e.action === "conflict.detected").at(-1);
  let local: Record<string, JsonValue> | null = null;
  if (op.entityType === "follow_up") {
    local = asRecord(followUpById.get(op.entityId));
  } else if (op.entityType === "screening") {
    local = asRecord(screeningById.get(op.entityId));
  }
  const patientId = patientIdOfOp(op, followUpById, screeningById);
  return {
    op,
    label: describeSyncOp(op).label,
    patientName: patientId === null ? null : (patientById.get(patientId)?.displayName ?? null),
    local,
    latest: asRecord(op.serverSnapshot),
    changedBy: stringField(detected?.changeSummary, "changedBy"),
    changedAt: stringField(detected?.changeSummary, "changedAt"),
  };
}
