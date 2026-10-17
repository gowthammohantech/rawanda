/**
 * Sync status for headers / Today strip / Sync center (HWM-02): simulated online / offline (live
 * from the network store), pending, conflicts (needs your decision), `lastSyncedAt` (latest
 * `syncRuns` row with `acknowledged > 0`, from FND `repo.sync.getStatus()`).
 */
import { useQuery } from "@tanstack/react-query";

import { useNetwork } from "../../network/NetworkProvider.tsx";
import { useRepository } from "../../providers.tsx";
import { workerKeys } from "../queryKeys.ts";

export type WorkerSyncStatus = {
  offline: boolean;
  pending: number;
  conflicts: number;
  rejected: number;
  lastSyncedAt: string | null;
  processing: boolean;
  loading: boolean;
};

export function useSyncStatus(): WorkerSyncStatus {
  const repo = useRepository();
  const { offline } = useNetwork();
  const query = useQuery({ queryKey: workerKeys.status, queryFn: () => repo.sync.getStatus() });
  const status = query.data;
  return {
    offline,
    pending: status?.pending ?? 0,
    conflicts: status?.needsDecision ?? 0,
    rejected: status?.byStatus.rejected ?? 0,
    lastSyncedAt: status?.lastSyncedAt ?? null,
    processing: status?.processing ?? false,
    loading: query.isPending,
  };
}
