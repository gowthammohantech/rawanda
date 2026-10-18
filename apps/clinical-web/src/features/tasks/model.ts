/**
 * Care-team task model (CLN-09): URL state, tab predicates, task type, allowed actions, workload
 * and the FND-03 `FollowUpUpdateInputSchema` parse used by every task dialog. Pure functions
 * only (no React, no wall clock: "now" is always the demo clock passed in).
 *
 * Tabs (`Due soon · Overdue · Unassigned · Unable to reach · Awaiting confirmation · Completed`)
 * are predicates over ONE list of the facility's follow-ups, so a tab badge is computed from the
 * same rows the tab shows (badge == rows by construction):
 * - dueSoon — open, assigned, not overdue and not `unable_to_reach` (upcoming work, by due date);
 * - overdue — DERIVED `isFollowUpOverdue` (`dueAt < now`, not completed), never a stored status;
 * - unassigned — open with no assigned worker;
 * - unableToReach — status `unable_to_reach` (offers Reassign);
 * - awaitingConfirmation — worker-reported completion, `clinicianConfirmation.status = pending`;
 * - completed — completed and not awaiting confirmation.
 * A task can appear in more than one tab (e.g. overdue AND unassigned).
 */
import {
  contractsErrorMap,
  FollowUpUpdateInputSchema,
  type ParsedValidationMessage,
} from "@laif/contracts";
import type { FollowUpUpdateCall } from "@laif/repositories";
import {
  followUpMachine,
  isFollowUpOverdue,
  type FollowUp,
  type FollowUpPurpose,
  type PersonaId,
} from "@laif/domain";

export const TASK_TABS = [
  "dueSoon",
  "overdue",
  "unassigned",
  "unableToReach",
  "awaitingConfirmation",
  "completed",
] as const;
export type TaskTab = (typeof TASK_TABS)[number];
export const DEFAULT_TASK_TAB: TaskTab = "dueSoon";

export type TaskParams = { tab: TaskTab; id: string | null };

const isTab = (value: unknown): value is TaskTab =>
  typeof value === "string" && (TASK_TABS as readonly string[]).includes(value);

export function parseTaskParams(params: URLSearchParams): TaskParams {
  const tab = params.get("tab");
  const id = params.get("id");
  return {
    tab: isTab(tab) ? tab : DEFAULT_TASK_TAB,
    id: id === null || id.trim() === "" ? null : id,
  };
}

export function patchTaskParams(
  current: URLSearchParams,
  patch: Partial<TaskParams>,
): URLSearchParams {
  const out = new URLSearchParams(current);
  if ("tab" in patch) {
    if (patch.tab === undefined || patch.tab === DEFAULT_TASK_TAB) out.delete("tab");
    else out.set("tab", patch.tab);
  }
  if ("id" in patch) {
    if (patch.id === null || patch.id === undefined) out.delete("id");
    else out.set("id", patch.id);
  }
  return out;
}

export const isTaskOpen = (fu: Pick<FollowUp, "status">): boolean => fu.status !== "completed";

export const isAwaitingConfirmation = (fu: Pick<FollowUp, "status" | "clinicianConfirmation">) =>
  fu.status === "completed" && fu.clinicianConfirmation.status === "pending";

export function matchesTab(fu: FollowUp, tab: TaskTab, now: Date): boolean {
  switch (tab) {
    case "dueSoon":
      return (
        isTaskOpen(fu) &&
        fu.assignedWorkerId !== null &&
        fu.status !== "unable_to_reach" &&
        !isFollowUpOverdue(fu, now)
      );
    case "overdue":
      return isFollowUpOverdue(fu, now);
    case "unassigned":
      return isTaskOpen(fu) && fu.assignedWorkerId === null;
    case "unableToReach":
      return fu.status === "unable_to_reach";
    case "awaitingConfirmation":
      return isAwaitingConfirmation(fu);
    case "completed":
      return fu.status === "completed" && !isAwaitingConfirmation(fu);
  }
}

export function rowsForTab(rows: readonly FollowUp[], tab: TaskTab, now: Date): FollowUp[] {
  return rows
    .filter((fu) => matchesTab(fu, tab, now))
    .sort((a, b) => a.dueAt.localeCompare(b.dueAt) || a.id.localeCompare(b.id));
}

export function tabCounts(rows: readonly FollowUp[], now: Date): Record<TaskTab, number> {
  return Object.fromEntries(
    TASK_TABS.map((tab) => [tab, rows.filter((fu) => matchesTab(fu, tab, now)).length]),
  ) as Record<TaskTab, number>;
}

export type TaskKpis = { open: number; overdue: number; unassigned: number; awaiting: number };

export function taskKpis(rows: readonly FollowUp[], now: Date): TaskKpis {
  return {
    open: rows.filter(isTaskOpen).length,
    overdue: rows.filter((fu) => isFollowUpOverdue(fu, now)).length,
    unassigned: rows.filter((fu) => isTaskOpen(fu) && fu.assignedWorkerId === null).length,
    awaiting: rows.filter(isAwaitingConfirmation).length,
  };
}

// ── Type column ──────────────────────────────────────────────────────────────

export type TaskType = "repeatTest" | "plannedReview" | "referralFollowUp";

const TYPE_BY_PURPOSE: Record<FollowUpPurpose, TaskType> = {
  repeat_screening: "repeatTest",
  planned_review: "plannedReview",
  referral_attendance: "referralFollowUp",
  post_referral_check: "referralFollowUp",
};

export const taskType = (fu: Pick<FollowUp, "purpose">): TaskType => TYPE_BY_PURPOSE[fu.purpose];

// ── Workload ─────────────────────────────────────────────────────────────────

export type WorkerLoad = { workerId: PersonaId; open: number; overdue: number };

/** Open / overdue counts per authorised worker (zero rows included, order of `workerIds`). */
export function workload(
  rows: readonly FollowUp[],
  workerIds: readonly PersonaId[],
  now: Date,
): WorkerLoad[] {
  return workerIds.map((workerId) => {
    const mine = rows.filter((fu) => fu.assignedWorkerId === workerId && isTaskOpen(fu));
    return {
      workerId,
      open: mine.length,
      overdue: mine.filter((fu) => isFollowUpOverdue(fu, now)).length,
    };
  });
}

// ── Actions ──────────────────────────────────────────────────────────────────

export type TaskAction =
  "assign" | "reassign" | "setDueDate" | "updateStatus" | "complete" | "confirm" | "note";

/**
 * The actions the drawer offers for a follow-up: care-team actions need `task.assign`; notes are
 * open to anyone who can see the task. Only legal next steps of the FND-02 machine are offered.
 */
export function allowedTaskActions(fu: FollowUp, canAssign: boolean): TaskAction[] {
  const out: TaskAction[] = [];
  const open = isTaskOpen(fu);
  if (canAssign && isAwaitingConfirmation(fu)) out.push("confirm");
  if (canAssign && open) {
    out.push(fu.assignedWorkerId === null ? "assign" : "reassign");
    out.push("setDueDate");
    const next = followUpMachine.next(fu.status);
    if (next.includes("unable_to_reach")) out.push("updateStatus");
    if (next.includes("completed")) out.push("complete");
  }
  out.push("note");
  return out;
}

// ── FND-03 parse (no app-local schema) ───────────────────────────────────────

/** Any valid key: the contract needs one; the real key travels with `useIdempotentMutation`. */
const PARSE_KEY = "00000000-0000-4000-8000-000000000000";

export type FieldErrors = Record<string, ParsedValidationMessage | string>;

export type ParseResult =
  { ok: true; value: FollowUpUpdateCall } | { ok: false; errors: FieldErrors };

/**
 * Parses a follow-up update with `FollowUpUpdateInputSchema` (blank strings = missing). Errors are
 * `validation:*` messages keyed by the input field name (rendered by the ui-web `Field`).
 */
export function parseFollowUpUpdate(raw: Record<string, unknown>): ParseResult {
  const input: Record<string, unknown> = { idempotencyKey: PARSE_KEY };
  for (const [name, value] of Object.entries(raw)) {
    if (typeof value === "string" && value.trim() === "") continue;
    if (value === null || value === undefined) continue;
    input[name] = value;
  }
  const parsed = FollowUpUpdateInputSchema.safeParse(input, { error: contractsErrorMap });
  if (!parsed.success) {
    const errors: FieldErrors = {};
    for (const issue of parsed.error.issues) {
      const head = issue.path[0];
      const name = typeof head === "string" ? head : "form";
      errors[name] ??= issue.message;
    }
    return { ok: false, errors };
  }
  const value: Record<string, unknown> = { ...parsed.data };
  delete value["idempotencyKey"];
  return { ok: true, value: value as FollowUpUpdateCall };
}

/** `dueAt` must be later than demo now (`validation:dateMustBeFuture`). */
export function isFutureIso(value: string, nowIso: string): boolean {
  return Date.parse(value) > Date.parse(nowIso);
}
