/**
 * Worker TanStack Query keys (HWM-02). Every repository mutation hook invalidates `['sync']`,
 * `['home']`, `['tasks']` and `['patients']` (`invalidateAfterWrite`), so the Sync tab badge, the header
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
  /** HWM-05 screening drafts (device-local). */
  drafts: ["drafts"] as const,
  draftList: (workerId: string, facilityId: string) =>
    ["drafts", "list", workerId, facilityId] as const,
  /** The draft opened in the form (loaded fresh on every mount, never refetched while open). */
  draft: (draftId: string) => ["drafts", "detail", draftId] as const,
  /** HWM-06 submitted screenings (detail access) — refreshed after every write / sync pass. */
  screenings: ["screenings"] as const,
  screening: (screeningId: string) => ["screenings", "detail", screeningId] as const,
  /** The draft under review (+ stored ruleset preview). */
  screeningReview: (draftId: string) => ["screenings", "review", draftId] as const,
  /** Sync ops of one screening (timeline, live "Saved on this device" → "Synced"). */
  screeningOps: (screeningId: string) => ["sync", "screening", screeningId] as const,
  /** HWM-07 My tasks: filtered list + counts, the audited open, and the refreshable detail. */
  tasks: ["tasks"] as const,
  taskList: (workerId: string, facilityId: string, filter: string, query: string) =>
    ["tasks", "list", workerId, facilityId, filter, query] as const,
  /** Audited open (`followup.viewed` / `access.denied`) — never re-run by writes. */
  taskAccess: (facilityId: string, followUpId: string) =>
    ["tasks", "access", facilityId, followUpId] as const,
  /** Unaudited re-read of an opened task (refreshed after writes / sync passes). */
  taskDetail: (facilityId: string, followUpId: string) =>
    ["tasks", "detail", facilityId, followUpId] as const,
} as const;

/** After a draft save / create / discard: the drafts list and Today (drafts count). */
export async function invalidateDrafts(queryClient: QueryClient): Promise<void> {
  await Promise.all([
    queryClient.invalidateQueries({
      queryKey: workerKeys.drafts,
      predicate: (query) => query.queryKey[1] !== "detail",
    }),
    queryClient.invalidateQueries({ queryKey: workerKeys.home }),
  ]);
}

/** Call after every repository write (and after a sync pass / demo change). */
export async function invalidateAfterWrite(queryClient: QueryClient): Promise<void> {
  await Promise.all([
    queryClient.invalidateQueries({ queryKey: workerKeys.sync }),
    queryClient.invalidateQueries({ queryKey: workerKeys.home }),
    queryClient.invalidateQueries({ queryKey: workerKeys.screenings }),
    // Tasks list + detail; the audited open is not re-run by a write.
    queryClient.invalidateQueries({
      queryKey: workerKeys.tasks,
      predicate: (query) => query.queryKey[1] !== "access",
    }),
    // Search / recent / history only — the audited context read is not re-run by a write.
    queryClient.invalidateQueries({
      queryKey: workerKeys.patients,
      predicate: (query) => query.queryKey[1] !== "access",
    }),
  ]);
}
