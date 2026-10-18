/**
 * Sync tab badge (HWM-02, HWM-09 task 9): items waiting to sync (queued + sending + retryable +
 * blocked) and items that need the worker's decision (conflicts). `usePendingCount` keeps the
 * HWM-02 meaning (waiting only).
 */
import { useQuery } from "@tanstack/react-query";

import { useRepository } from "../../providers.tsx";
import { workerKeys } from "../queryKeys.ts";

function useStatusCounts() {
  const repo = useRepository();
  const query = useQuery({
    queryKey: workerKeys.pendingCount,
    queryFn: async () => {
      const status = await repo.sync.getStatus();
      return { pending: status.pending, decision: status.needsDecision };
    },
  });
  return query.data ?? { pending: 0, decision: 0 };
}

export function usePendingCount(): number {
  return useStatusCounts().pending;
}

/** Waiting + needs decision, for the Sync tab badge and its spoken label. */
export function useSyncBadge(): { pending: number; decision: number; total: number } {
  const { pending, decision } = useStatusCounts();
  return { pending, decision, total: pending + decision };
}
