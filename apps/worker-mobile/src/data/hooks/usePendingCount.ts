/** Ops still to be sent (queued + sending + retryable + blocked) — Sync tab badge (HWM-02). */
import { useQuery } from "@tanstack/react-query";

import { useRepository } from "../../providers.tsx";
import { workerKeys } from "../queryKeys.ts";

export function usePendingCount(): number {
  const repo = useRepository();
  const query = useQuery({
    queryKey: workerKeys.pendingCount,
    queryFn: async () => (await repo.sync.getStatus()).pending,
  });
  return query.data ?? 0;
}
