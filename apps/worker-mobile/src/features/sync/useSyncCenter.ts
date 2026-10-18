/**
 * HWM-09 hooks: the grouped queue (re-read every second while a retry countdown is visible),
 * one op's detail, the conflict comparison, and the actions — Sync now (audited
 * `worker.sync.manual_requested`; a tap during a run joins it and is audited
 * `worker.sync.duplicate_tap_coalesced`), Retry now and the conflict resolution.
 */
import type { ConflictResolution, SyncOperation } from "@laif/domain";
import type { SyncRun } from "@laif/repositories";
import { announce, useToast, useTx, type TranslationKey } from "@laif/ui-native";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useCallback, useRef } from "react";

import { invalidateAfterWrite, workerKeys } from "../../data/queryKeys.ts";
import { loadConflict, loadOpDetail, loadSyncCenter } from "../../data/syncCenter.ts";
import { useNetwork } from "../../network/NetworkProvider.tsx";
import { useRepository } from "../../providers.tsx";
import { useRequiredScope } from "../../session/useScope.ts";
import { resolveConflict, syncAfterResolution } from "../../sync/resolve.ts";
import { useSyncTriggers } from "../../sync/SyncTriggersProvider.tsx";

export function useSyncCenter() {
  const repo = useRepository();
  const { facilityId } = useRequiredScope();
  return useQuery({
    queryKey: workerKeys.syncCenter(facilityId),
    queryFn: () => loadSyncCenter(repo, facilityId),
    // Live "Retrying in 8s" countdown while a retry is scheduled.
    refetchInterval: (query) =>
      query.state.data?.sections.waiting.some((row) => row.retry.kind === "scheduled")
        ? 1_000
        : false,
  });
}

export function useOpDetail(opId: string) {
  const repo = useRepository();
  const { facilityId } = useRequiredScope();
  return useQuery({
    queryKey: workerKeys.syncOp(facilityId, opId),
    queryFn: () => loadOpDetail(repo, facilityId, opId),
  });
}

export function useConflict(opId: string) {
  const repo = useRepository();
  const { facilityId } = useRequiredScope();
  return useQuery({
    queryKey: workerKeys.syncConflict(facilityId, opId),
    queryFn: () => loadConflict(repo, facilityId, opId),
  });
}

type Translate = ReturnType<typeof useTx>;

/** "3 synced · 1 needs your decision" (empty parts left out). */
export function runSummary(run: SyncRun, t: Translate): string {
  if (run.offline) return t("worker:sync.toast.offline");
  const parts: [TranslationKey, number][] = [
    ["worker:sync.toast.synced", run.acknowledged],
    ["worker:sync.toast.decision", run.conflicts],
    ["worker:sync.toast.retry", run.retryableFailures],
    ["worker:sync.toast.rejected", run.rejected],
    ["worker:sync.toast.blocked", run.blocked],
  ];
  const text = parts
    .filter(([, count]) => count > 0)
    .map(([key, count]) => t(key, { count }))
    .join(" · ");
  return text === "" ? t("worker:sync.toast.nothing") : text;
}

const toneOf = (run: SyncRun) =>
  run.offline || run.conflicts > 0 || run.retryableFailures > 0
    ? ("warning" as const)
    : run.rejected > 0 || run.blocked > 0
      ? ("danger" as const)
      : ("positive" as const);

/** Sync now: one run however often it is tapped (WF-02 step 2), result toast + live region. */
export function useSyncNow() {
  const repo = useRepository();
  const triggers = useSyncTriggers();
  const { offline } = useNetwork();
  const { facilityId } = useRequiredScope();
  const { toast } = useToast();
  const t = useTx();
  const taps = useRef(0);

  return useCallback(async (): Promise<SyncRun | null> => {
    if (offline) return null;
    const coalesced = triggers.isRunning();
    taps.current += 1;
    void repo
      .recordAuditEvent({
        action: coalesced ? "worker.sync.duplicate_tap_coalesced" : "worker.sync.manual_requested",
        entityType: "sync_operation",
        entityId: "sync_center",
        facilityId,
        changeSummary: { trigger: "manual", tap: taps.current },
      })
      .catch(() => undefined);
    if (!coalesced) announce(t("worker:sync.live.running"));
    try {
      const { run, joined } = await triggers.runNow("manual");
      if (joined) return run;
      const summary = runSummary(run, t);
      toast({ title: summary, tone: toneOf(run) });
      announce(t("worker:sync.live.done", { summary }));
      return run;
    } catch {
      toast({ title: t("worker:sync.toast.failed"), tone: "danger" });
      return null;
    }
  }, [offline, triggers, repo, facilityId, toast, t]);
}

/** Retry now: `retryable_failure` → `queued` (FND-07 `retryNow`), then one run when online. */
export function useRetryNow() {
  const repo = useRepository();
  const triggers = useSyncTriggers();
  const queryClient = useQueryClient();
  const { offline } = useNetwork();
  const { toast } = useToast();
  const t = useTx();
  return useCallback(
    async (op: Pick<SyncOperation, "id">) => {
      try {
        await repo.sync.retryNow(op.id);
      } catch {
        toast({ title: t("worker:sync.retryFailed"), tone: "danger" });
        return;
      }
      await invalidateAfterWrite(queryClient);
      if (offline) {
        toast({ title: t("worker:sync.retryQueued"), tone: "info" });
        return;
      }
      try {
        const { run } = await triggers.runNow("manual");
        toast({ title: runSummary(run, t), tone: toneOf(run) });
      } catch {
        toast({ title: t("worker:sync.toast.failed"), tone: "danger" });
      }
    },
    [repo, triggers, queryClient, offline, toast, t],
  );
}

export function useResolveConflict() {
  const repo = useRepository();
  const triggers = useSyncTriggers();
  const queryClient = useQueryClient();
  const { offline } = useNetwork();
  const { personaId } = useRequiredScope();
  return useCallback(
    async (
      op: SyncOperation,
      resolution: ConflictResolution,
      key: string,
      note: string | undefined,
    ) => {
      const result = await resolveConflict(repo, op, resolution, key, {
        actorId: personaId,
        ...(note === undefined ? {} : { note }),
      });
      await invalidateAfterWrite(queryClient);
      // WF-02 step 5: send the decision (re-applied op / notice) right away when online.
      void syncAfterResolution(triggers.runNow, offline);
      return result;
    },
    [repo, triggers, queryClient, offline, personaId],
  );
}
