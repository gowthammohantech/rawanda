/**
 * Worker TanStack Query keys (HWM-02). Every repository mutation hook invalidates `['sync']` and
 * `['home']` (`invalidateAfterWrite`), so the Sync tab badge, the header badge and Today refresh.
 */
import type { QueryClient } from "@tanstack/react-query";

export const workerKeys = {
  sync: ["sync"] as const,
  pendingCount: ["sync", "pendingCount"] as const,
  status: ["sync", "status"] as const,
  entity: (entityId: string) => ["sync", "entity", entityId] as const,
  home: ["home"] as const,
} as const;

/** Call after every repository write (and after a sync pass / demo change). */
export async function invalidateAfterWrite(queryClient: QueryClient): Promise<void> {
  await Promise.all([
    queryClient.invalidateQueries({ queryKey: workerKeys.sync }),
    queryClient.invalidateQueries({ queryKey: workerKeys.home }),
  ]);
}
