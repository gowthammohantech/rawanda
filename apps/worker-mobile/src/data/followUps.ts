/**
 * Worker follow-ups (HWM-03 task 1): the signed-in worker's follow-ups joined with the patient's
 * display name + synthetic identifier, and the Today selectors. Read through the FND-07
 * repository (`listFollowUps({ assignedWorkerId, facilityIds })`, scope enforced there); the
 * facility filter is ALSO applied here, defensively, so a row of another facility that reached
 * the device never shows.
 *
 * No audit: an aggregated own worklist is not a per-patient read (`listPatients` /
 * `listFollowUps` do not audit; `getPatient` would, so it is not used).
 *
 * HWM-07 adds the My tasks filters (`taskFilterOf`, `countTasks`, `selectTasks`,
 * `listByFilter`, `counts`) and the scope-checked, audited task detail (`getDetail`).
 */
import {
  calendarDaysOverdue,
  deriveSyncState,
  dueBucket,
  type ContactAttempt,
  type DueBucket,
  type EntitySyncState,
  type FacilityId,
  type FollowUp,
  type Patient,
  type Referral,
  type Screening,
  type SyncOperation,
} from "@laif/domain";
import { DEMO_PERSONAS } from "@laif/mock-data";
import { RepositoryError, type CareRepository } from "@laif/repositories";

export type WorkerScopeInput = { workerId: string; facilityId: FacilityId };

export type WorkerFollowUp = {
  followUp: FollowUp;
  patientName: string;
  patientIdentifier: string;
};

const PAGE_SIZE = 200;

/** Every page of a repository list (the worker slice is small; pages are capped at 200). */
async function allPages<T>(
  load: (page: number) => Promise<{ items: T[]; total: number }>,
): Promise<T[]> {
  const items: T[] = [];
  for (let page = 1; ; page += 1) {
    const result = await load(page);
    items.push(...result.items);
    if (result.items.length === 0 || items.length >= result.total) return items;
  }
}

/** Patients of the facility, by id (display name + identifier only are used). */
export async function patientIndex(
  repo: Pick<CareRepository, "listPatients">,
  facilityId: string,
): Promise<Map<string, Patient>> {
  const patients = await allPages((page) =>
    repo.listPatients({ facilityIds: [facilityId], page, pageSize: PAGE_SIZE }),
  );
  return new Map(
    patients.filter((p) => p.facilityId === facilityId).map((p) => [p.id as string, p]),
  );
}

export async function listForWorker(
  repo: Pick<CareRepository, "listFollowUps" | "listPatients">,
  { workerId, facilityId }: WorkerScopeInput,
): Promise<WorkerFollowUp[]> {
  const [followUps, patients] = await Promise.all([
    allPages((page) =>
      repo.listFollowUps({
        assignedWorkerId: workerId,
        facilityIds: [facilityId],
        page,
        pageSize: PAGE_SIZE,
      }),
    ),
    patientIndex(repo, facilityId),
  ]);
  return followUps
    .filter((fu) => fu.facilityId === facilityId && fu.assignedWorkerId === workerId)
    .map((followUp) => {
      const patient = patients.get(followUp.patientId);
      return {
        followUp,
        patientName: patient?.displayName ?? "",
        patientIdentifier: patient?.syntheticIdentifier ?? "",
      };
    });
}

export type PrioritisedFollowUp = WorkerFollowUp & {
  bucket: Exclude<DueBucket, "completed">;
  /** Whole Kigali calendar days past the due day (overdue rows only, else 0). */
  daysOverdue: number;
};

const BUCKET_RANK: Record<PrioritisedFollowUp["bucket"], number> = {
  overdue: 0,
  due_today: 1,
  upcoming: 2,
};

/**
 * HWM-03 task 3: open follow-ups ordered overdue (oldest due first) → due today (earliest) →
 * upcoming (earliest); ties broken by the stable follow-up id (never by queue `localSeq`).
 * Purely by due date — no clinical urgency is inferred.
 */
export function prioritiseFollowUps(
  rows: readonly WorkerFollowUp[],
  now: Date,
): PrioritisedFollowUp[] {
  const open: PrioritisedFollowUp[] = [];
  for (const row of rows) {
    const bucket = dueBucket(row.followUp, now);
    if (bucket === "completed") continue;
    open.push({ ...row, bucket, daysOverdue: calendarDaysOverdue(row.followUp, now) });
  }
  return open.sort(
    (a, b) =>
      BUCKET_RANK[a.bucket] - BUCKET_RANK[b.bucket] ||
      Date.parse(a.followUp.dueAt) - Date.parse(b.followUp.dueAt) ||
      (a.followUp.id < b.followUp.id ? -1 : a.followUp.id > b.followUp.id ? 1 : 0),
  );
}

// ── HWM-07 My tasks ─────────────────────────────────────────────────────────

/** Tasks tab filters (route param `?filter=`). */
export const TASK_FILTERS = ["due", "overdue", "completed"] as const;
export type TaskFilter = (typeof TASK_FILTERS)[number];

export function parseTaskFilter(value: unknown): TaskFilter {
  return typeof value === "string" && (TASK_FILTERS as readonly string[]).includes(value)
    ? (value as TaskFilter)
    : "due";
}

/**
 * The tab a follow-up belongs to, derived at view time from the demo clock (nothing stored):
 * - `completed`: status `completed`;
 * - `overdue`: not completed and due before the START of today in Africa/Kigali (`dueBucket`,
 *   the SAME rule as Today, so the counts match) — includes `unable_to_reach` awaiting
 *   reassignment;
 * - `due`: every other open follow-up (due today or later).
 */
export function taskFilterOf(followUp: Pick<FollowUp, "status" | "dueAt">, now: Date): TaskFilter {
  const bucket = dueBucket(followUp, now);
  return bucket === "completed" ? "completed" : bucket === "overdue" ? "overdue" : "due";
}

export type TaskCounts = Record<TaskFilter, number>;

/** All three tab counts in one pass (Tasks badges; Today's `overdue` uses the same rule). */
export function countTasks(rows: readonly WorkerFollowUp[], now: Date): TaskCounts {
  const counts: TaskCounts = { due: 0, overdue: 0, completed: 0 };
  for (const row of rows) counts[taskFilterOf(row.followUp, now)] += 1;
  return counts;
}

export type TaskListRow = WorkerFollowUp & {
  filter: TaskFilter;
  bucket: DueBucket;
  /** Whole Kigali calendar days past the due day (overdue rows only, else 0). */
  daysOverdue: number;
  syncState: EntitySyncState;
};

const normalise = (value: string): string =>
  value.normalize("NFD").replace(/[̀-ͯ]/gu, "").toLowerCase().replace(/\s+/gu, " ").trim();

/** Search within tasks: patient name ("contains") or synthetic identifier (prefix). */
export function matchesTaskQuery(row: WorkerFollowUp, query: string): boolean {
  const q = normalise(query);
  if (q === "") return true;
  return normalise(row.patientName).includes(q) || normalise(row.patientIdentifier).startsWith(q);
}

const byId = (a: WorkerFollowUp, b: WorkerFollowUp) =>
  a.followUp.id < b.followUp.id ? -1 : a.followUp.id > b.followUp.id ? 1 : 0;

export type TaskSelection = { filter: TaskFilter; query?: string };

export type SyncOpLike = Pick<SyncOperation, "entityId" | "status" | "localSeq">;

/**
 * Pure selector over the worker's follow-ups: one filter, optional search, sorted by due date
 * (earliest first; ties by id) — completed by `completedAt` (newest first).
 */
export function selectTasks(
  rows: readonly WorkerFollowUp[],
  ops: readonly SyncOpLike[],
  now: Date,
  { filter, query = "" }: TaskSelection,
): TaskListRow[] {
  const selected = rows
    .filter((row) => taskFilterOf(row.followUp, now) === filter && matchesTaskQuery(row, query))
    .map((row) => ({
      ...row,
      filter,
      bucket: dueBucket(row.followUp, now),
      daysOverdue: calendarDaysOverdue(row.followUp, now),
      syncState: deriveSyncState(row.followUp.id, ops),
    }));
  if (filter === "completed") {
    return selected.sort(
      (a, b) =>
        (b.followUp.completedAt ?? "").localeCompare(a.followUp.completedAt ?? "") || byId(a, b),
    );
  }
  return selected.sort(
    (a, b) => Date.parse(a.followUp.dueAt) - Date.parse(b.followUp.dueAt) || byId(a, b),
  );
}

export type TaskList = {
  nowIso: string;
  counts: TaskCounts;
  items: TaskListRow[];
};

/** Repository demo clock (after the reads, so a persisted time-travel offset is applied). */
async function demoNow(repo: Pick<CareRepository, "demo">): Promise<Date> {
  return new Date((await repo.demo.getDemoState()).clockIso);
}

/**
 * HWM-07 task 1: the worker's follow-ups of one filter (+ search) and all three counts, read in
 * one go so the badges always equal the list lengths. Scope: `listForWorker` (assigned worker +
 * facility, enforced by the repository and re-applied). No writes, no audit.
 */
export async function listByFilter(
  repo: Pick<CareRepository, "listFollowUps" | "listPatients" | "sync" | "demo">,
  scope: WorkerScopeInput,
  selection: TaskSelection,
): Promise<TaskList> {
  const [rows, ops] = await Promise.all([listForWorker(repo, scope), repo.sync.list()]);
  const now = await demoNow(repo);
  return {
    nowIso: now.toISOString(),
    counts: countTasks(rows, now),
    items: selectTasks(rows, ops, now, selection),
  };
}

/** HWM-07 task 2: the three tab counts (shared rule with Today). */
export async function counts(
  repo: Pick<CareRepository, "listFollowUps" | "listPatients" | "demo">,
  scope: WorkerScopeInput,
): Promise<TaskCounts> {
  const rows = await listForWorker(repo, scope);
  return countTasks(rows, await demoNow(repo));
}

// ── HWM-07 task detail ──────────────────────────────────────────────────────

/** Entity sync state, or `failed` for an item whose op is waiting to retry ("Will retry"). */
export type TimelineSyncState = EntitySyncState | "failed";

/** Sync state of one op for the timeline (`retryable_failure` → "Not sent — will retry"). */
function itemSyncState(op: Pick<SyncOperation, "entityId" | "status" | "localSeq">) {
  return op.status === "retryable_failure" ? "failed" : deriveSyncState(op.entityId, [op]);
}

export type TaskAttemptView = ContactAttempt & { syncState: TimelineSyncState };

export type TaskDetail = {
  nowIso: string;
  followUp: FollowUp;
  patient: Patient | null;
  /** Latest submitted screening of the patient in this facility (drafts excluded). */
  latestScreening: Screening | null;
  referral: Referral | null;
  /** Display name of the clinician who assigned the task (last assignment), if known. */
  assignedByName: string | null;
  bucket: DueBucket;
  daysOverdue: number;
  /** Whole-entity sync state (pending / conflict pill + banner). */
  syncState: EntitySyncState;
  /** Attempts newest first, each with its own sync state. */
  attempts: TaskAttemptView[];
  outcomeSyncState: TimelineSyncState | null;
};

export type TaskAccess = { status: "ok"; detail: TaskDetail } | { status: "denied" };

type DetailRepo = Pick<
  CareRepository,
  | "listFollowUps"
  | "listPatients"
  | "listScreenings"
  | "listReferrals"
  | "recordAuditEvent"
  | "sync"
  | "demo"
>;

const opAction = (op: Pick<SyncOperation, "payload">): string | null => {
  const payload = op.payload;
  if (payload === null || typeof payload !== "object" || Array.isArray(payload)) return null;
  const action = (payload as Record<string, unknown>)["action"];
  return typeof action === "string" ? action : null;
};

/**
 * Per-item sync state of the attempt timeline: attempts are appended in order, so the last N
 * attempts belong to this device's N `record_attempt` ops (in `localSeq` order); older
 * attempts arrived with the seed / a previous sync and are synced.
 */
export function attemptSyncStates(
  followUp: Pick<FollowUp, "id" | "attempts" | "outcome">,
  ops: readonly Pick<SyncOperation, "entityId" | "status" | "localSeq" | "payload">[],
): { attempts: TimelineSyncState[]; outcome: TimelineSyncState | null } {
  const own = ops
    .filter((op) => op.entityId === followUp.id && op.status !== "superseded")
    .sort((a, b) => a.localSeq - b.localSeq);
  const attemptOps = own.filter((op) => opAction(op) === "record_attempt");
  const states: TimelineSyncState[] = followUp.attempts.map(() => "synced");
  const offset = followUp.attempts.length - attemptOps.length;
  attemptOps.forEach((op, index) => {
    const at = offset + index;
    if (at >= 0) states[at] = itemSyncState(op);
  });
  const outcomeOp = own.filter((op) => opAction(op) === "record_outcome").at(-1);
  const outcome =
    followUp.outcome === null
      ? null
      : outcomeOp === undefined
        ? "synced"
        : itemSyncState(outcomeOp);
  return { attempts: states, outcome };
}

async function recordTaskDenied(
  repo: Pick<CareRepository, "recordAuditEvent">,
  facilityId: FacilityId,
  followUpId: string,
): Promise<void> {
  await repo
    .recordAuditEvent({
      action: "access.denied",
      entityType: "follow_up",
      entityId: followUpId.trim() === "" ? "unknown" : followUpId,
      facilityId,
      outcome: "denied",
      changeSummary: { reason: "NOT_ASSIGNED_OR_SCOPE", route: "task_detail" },
    })
    .catch(() => undefined);
}

/**
 * HWM-07 task 5: scope-checked task detail. Only follow-ups assigned to the signed-in worker in
 * the signed-in facility open; anything else (another worker's task, another facility, an id
 * not on this device) → `denied` + one `access.denied` audit, and NOTHING of the patient is
 * returned. A successful open audits `followup.viewed` exactly once (sensitive read). Patient
 * fields come from the unaudited facility index (the task open is the audited read).
 * `audit: false` is the silent re-read of an already-opened task (after a write / sync pass).
 */
export async function getDetail(
  repo: DetailRepo,
  scope: WorkerScopeInput,
  followUpId: string,
  /** `true`: audit the open and a denial; `"denied"`: audit only a denial (forms); `false`: none. */
  { audit = true }: { audit?: boolean | "denied" } = {},
): Promise<TaskAccess> {
  let rows: WorkerFollowUp[];
  try {
    rows = await listForWorker(repo, scope);
  } catch (error) {
    if (error instanceof RepositoryError && error.code === "FORBIDDEN") {
      return { status: "denied" };
    }
    throw error;
  }
  const followUp = rows.find((row) => row.followUp.id === followUpId)?.followUp;
  if (followUp === undefined) {
    if (audit) await recordTaskDenied(repo, scope.facilityId, followUpId);
    return { status: "denied" };
  }
  const [patients, screenings, referrals, ops] = await Promise.all([
    patientIndex(repo, scope.facilityId),
    repo.listScreenings({
      patientId: followUp.patientId,
      facilityIds: [scope.facilityId],
      pageSize: PAGE_SIZE,
    }),
    followUp.referralId === null
      ? Promise.resolve(null)
      : allPages((page) =>
          repo.listReferrals({
            patientId: followUp.patientId,
            facilityIds: [scope.facilityId],
            page,
            pageSize: PAGE_SIZE,
          }),
        ),
    repo.sync.list(),
  ]);
  const now = await demoNow(repo);
  const latestScreening =
    screenings.items
      .filter((s) => s.status !== "draft" && s.facilityId === scope.facilityId)
      .sort((a, b) => b.measuredAt.localeCompare(a.measuredAt) || a.id.localeCompare(b.id))[0] ??
    null;
  const referral = referrals?.find((r) => r.id === followUp.referralId) ?? null;
  const assignedBy = followUp.assignmentHistory.at(-1)?.assignedBy ?? null;
  const sync = attemptSyncStates(followUp, ops);
  const attempts = followUp.attempts
    .map((attempt, index) => ({ ...attempt, syncState: sync.attempts[index] ?? "synced" }))
    .sort((a, b) => b.at.localeCompare(a.at) || b.id.localeCompare(a.id));

  if (audit === true) {
    await repo.recordAuditEvent({
      action: "followup.viewed",
      entityType: "follow_up",
      entityId: followUp.id,
      patientId: followUp.patientId,
      facilityId: followUp.facilityId,
      changeSummary: { route: "task_detail" },
    });
  }

  return {
    status: "ok",
    detail: {
      nowIso: now.toISOString(),
      followUp,
      patient: patients.get(followUp.patientId) ?? null,
      latestScreening,
      referral,
      assignedByName:
        assignedBy === null
          ? null
          : (DEMO_PERSONAS.find((p) => p.id === assignedBy)?.displayName ?? null),
      bucket: dueBucket(followUp, now),
      daysOverdue: calendarDaysOverdue(followUp, now),
      syncState: deriveSyncState(followUp.id, ops),
      attempts,
      outcomeSyncState: sync.outcome,
    },
  };
}
