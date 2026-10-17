/**
 * Today summary (HWM-03 task 2). Every number is computed from the local store at view time:
 * - `overdue`: not completed and due before the start of today (Africa/Kigali) — `dueBucket`;
 * - `dueToday`: not completed, due today; `completedToday`: `completedAt` within today;
 * - `todaysWork` = overdue + due today + completed today (progress bar denominator);
 * - `next`: top 5 open follow-ups by `prioritiseFollowUps`, each with its derived sync state;
 * - drafts: count + first 3; `pendingCount` / `lastSyncedAt` / conflicts from `useSyncStatus`.
 * "Now" is the repository's demo clock (`demo.getDemoState().clockIso`, incl. time travel), so
 * moving the demo clock re-buckets items without any write. Nothing is stored.
 *
 * Query keys: `['home','clock']` and `['home','summary', workerId, facilityId, demoDate]` — every
 * write helper invalidates `['home']` (`invalidateAfterWrite`), so the screen updates live.
 */
import { zonedDay } from "@laif/domain";
import { useQuery } from "@tanstack/react-query";

import type { WorkerScopeInput } from "../../data/followUps.ts";
import { useSyncStatus } from "../../data/hooks/useSyncStatus.ts";
import { workerKeys } from "../../data/queryKeys.ts";
import { useRepository } from "../../providers.tsx";
import { useRequiredScope } from "../../session/useScope.ts";
import { loadTodaySummary, type TodaySummary } from "./todaySummary.ts";

export {
  computeTodaySummary,
  loadTodaySummary,
  DRAFTS_PREVIEW_LIMIT,
  NEXT_FOLLOW_UPS_LIMIT,
  type NextFollowUp,
  type TodaySummary,
  type TodaySummaryInput,
} from "./todaySummary.ts";

export type TodaySummaryView = {
  status: "loading" | "error" | "ready";
  data: TodaySummary | undefined;
  error: unknown;
  refetch: () => Promise<unknown>;
  offline: boolean;
  pendingCount: number;
  conflicts: number;
  lastSyncedAt: string | null;
};

export function useTodaySummary(): TodaySummaryView {
  const repo = useRepository();
  const scope = useRequiredScope();
  const sync = useSyncStatus();
  const input: WorkerScopeInput = { workerId: scope.personaId, facilityId: scope.facilityId };

  const clock = useQuery({
    queryKey: workerKeys.homeClock,
    queryFn: async () => (await repo.demo.getDemoState()).clockIso,
  });
  const demoDate = clock.data === undefined ? null : zonedDay(new Date(clock.data)).date;
  const summary = useQuery({
    queryKey: workerKeys.homeSummary(input.workerId, input.facilityId, demoDate ?? ""),
    queryFn: () => loadTodaySummary(repo, input),
    enabled: demoDate !== null,
  });

  const error = clock.error ?? summary.error;
  const status =
    error !== null ? "error" : summary.data === undefined ? "loading" : ("ready" as const);
  return {
    status,
    data: summary.data,
    error,
    refetch: () => (clock.isError ? clock.refetch() : summary.refetch()),
    offline: sync.offline,
    pendingCount: sync.pending,
    conflicts: sync.conflicts,
    lastSyncedAt: sync.lastSyncedAt,
  };
}
