/**
 * Worker TanStack Query keys (HWM-02). Every repository mutation hook invalidates `['sync']`,
 * `['home']` and `['patients']` (`invalidateAfterWrite`), so the Sync tab badge, the header
 * badge, Today and the Find tab refresh.
 */
import type { QueryClient } from "@tanstack/react-query";

export const workerKeys = {
  sync: ["sync"] as const,
  pendingCount: ["sync", "pendingCount"] as const,
  status: ["sync", "status"] as const,
  entity: (entityId: string) => ["sync", "entity", entityId] as const,
  home: ["home"] as const,
  /** Demo clock instant read from the repository (Today's date). */
  homeClock: ["home", "clock"] as const,
  /** HWM-03 Today summary for the worker on the Kigali demo date. */
  homeSummary: (workerId: string, facilityId: string, demoDate: string) =>
    ["home", "summary", workerId, facilityId, demoDate] as const,
  /** HWM-04 patients: search, recent, context (access) and history of one patient. */
  patients: ["patients"] as const,
  patientSearch: (facilityId: string, query: string) =>
    ["patients", "search", facilityId, query] as const,
  patientRecent: (facilityId: string) => ["patients", "recent", facilityId] as const,
  patientAccess: (facilityId: string, patientId: string) =>
    ["patients", "access", facilityId, patientId] as const,
  patientHistory: (facilityId: string, patientId: string) =>
    ["patients", "history", facilityId, patientId] as const,
} as const;

/** Call after every repository write (and after a sync pass / demo change). */
export async function invalidateAfterWrite(queryClient: QueryClient): Promise<void> {
  await Promise.all([
    queryClient.invalidateQueries({ queryKey: workerKeys.sync }),
    queryClient.invalidateQueries({ queryKey: workerKeys.home }),
    // Search / recent / history only — the audited context read is not re-run by a write.
    queryClient.invalidateQueries({
      queryKey: workerKeys.patients,
      predicate: (query) => query.queryKey[1] !== "access",
    }),
  ]);
}
