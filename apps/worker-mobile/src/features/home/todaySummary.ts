/**
 * Today summary selectors (HWM-03 task 2) — pure / repository-only, no React. See
 * `useTodaySummary.ts` for the hook and the derivation rules.
 */
import {
  deriveSyncState,
  isSameZonedDay,
  zonedDay,
  type EntitySyncState,
  type SyncOperation,
} from "@laif/domain";
import type { CareRepository } from "@laif/repositories";

import { listDrafts, type DraftRow } from "../../data/drafts.ts";
import {
  listForWorker,
  prioritiseFollowUps,
  type PrioritisedFollowUp,
  type WorkerFollowUp,
  type WorkerScopeInput,
} from "../../data/followUps.ts";

export const NEXT_FOLLOW_UPS_LIMIT = 5;
export const DRAFTS_PREVIEW_LIMIT = 3;

export type NextFollowUp = PrioritisedFollowUp & { syncState: EntitySyncState };

export type TodaySummary = {
  nowIso: string;
  /** `YYYY-MM-DD` in Africa/Kigali. */
  demoDate: string;
  overdue: number;
  dueToday: number;
  completedToday: number;
  todaysWork: number;
  /** Open follow-ups (any due date). */
  openCount: number;
  next: NextFollowUp[];
  draftCount: number;
  drafts: DraftRow[];
};

export type TodaySummaryInput = {
  followUps: readonly WorkerFollowUp[];
  drafts: readonly DraftRow[];
  ops: readonly Pick<SyncOperation, "entityId" | "status" | "localSeq">[];
  now: Date;
};

/** Pure selector (unit-tested against the seed). */
export function computeTodaySummary({
  followUps,
  drafts,
  ops,
  now,
}: TodaySummaryInput): TodaySummary {
  const open = prioritiseFollowUps(followUps, now);
  const overdue = open.filter((row) => row.bucket === "overdue").length;
  const dueToday = open.filter((row) => row.bucket === "due_today").length;
  const completedToday = followUps.filter(
    ({ followUp }) =>
      followUp.status === "completed" &&
      followUp.completedAt !== null &&
      isSameZonedDay(followUp.completedAt, now),
  ).length;
  return {
    nowIso: now.toISOString(),
    demoDate: zonedDay(now).date,
    overdue,
    dueToday,
    completedToday,
    todaysWork: overdue + dueToday + completedToday,
    openCount: open.length,
    next: open.slice(0, NEXT_FOLLOW_UPS_LIMIT).map((row) => ({
      ...row,
      syncState: deriveSyncState(row.followUp.id, ops),
    })),
    draftCount: drafts.length,
    drafts: drafts.slice(0, DRAFTS_PREVIEW_LIMIT),
  };
}

/** Reads everything the summary needs (no writes, no audit) and computes it. */
export async function loadTodaySummary(
  repo: CareRepository,
  scope: WorkerScopeInput,
): Promise<TodaySummary> {
  const [followUps, drafts, ops] = await Promise.all([
    listForWorker(repo, scope),
    listDrafts(repo, scope),
    repo.sync.list(),
  ]);
  // After the reads: the repository has applied any persisted demo-clock offset.
  const { clockIso } = await repo.demo.getDemoState();
  return computeTodaySummary({ followUps, drafts, ops, now: new Date(clockIso) });
}
