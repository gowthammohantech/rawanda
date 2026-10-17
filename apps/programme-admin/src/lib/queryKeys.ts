/**
 * TanStack Query keys of the admin app (ADM-02 task 11). Everything scoped to a session lives
 * under `['admin', 'scoped', scopeKey, …]` with `scopeKey = ${grantId}@${grantVersion}`, so a grant
 * edit (new version) never reuses cached numbers and sign-out drops them (`adminKeys.scoped`).
 */
import type { AccessGrant } from "@laif/contracts";

import type { AdminFilters } from "../features/filters/filterSchema.ts";

export type ScopeKey = string;

export function scopeKeyOf(grant: Pick<AccessGrant, "id" | "version"> | null): ScopeKey {
  return grant === null ? "none" : `${grant.id}@${grant.version}`;
}

/** Filters as a stable key part (period already resolved, so a new day is a new key). */
export type FilterKey = AdminFilters & { periodFrom: string; periodTo: string };

export const adminKeys = {
  all: ["admin"] as const,
  scoped: ["admin", "scoped"] as const,
  scope: (scopeKey: ScopeKey) => [...adminKeys.scoped, scopeKey] as const,
  dataset: (scopeKey: ScopeKey, filters: FilterKey) =>
    [...adminKeys.scope(scopeKey), "dataset", filters] as const,
  /** Derived from the dataset; the suppression threshold is part of the key. */
  overview: (scopeKey: ScopeKey, filters: FilterKey, threshold: number) =>
    [...adminKeys.scope(scopeKey), "overview", filters, threshold] as const,
  freshness: (scopeKey: ScopeKey) => [...adminKeys.scope(scopeKey), "freshness"] as const,
  /** ADM-03: funnel view (derived from the scope-wide dataset; threshold part of the key). */
  funnel: (scopeKey: ScopeKey, filters: FilterKey, threshold: number) =>
    [...adminKeys.scope(scopeKey), "funnel", filters, threshold] as const,
  /** ADM-03: stage drill-down (current + previous equal-length period). */
  funnelStage: (scopeKey: ScopeKey, stage: string, filters: FilterKey, threshold: number) =>
    [...adminKeys.scope(scopeKey), "funnelStage", stage, filters, threshold] as const,
  /**
   * ADM-04: timeliness view. `nowIso` is the demo-clock instant (to the minute), so a clock
   * reset / time travel invalidates the derived overdue figures; the threshold is part of the key.
   */
  timeliness: (scopeKey: ScopeKey, filters: FilterKey, nowIso: string, threshold: number) =>
    [...adminKeys.scope(scopeKey), "timeliness", filters, nowIso, threshold] as const,
  /** ADM-03: programme follow-up actions in the grant scope. */
  programmeActions: (scopeKey: ScopeKey) =>
    [...adminKeys.scope(scopeKey), "programmeActions"] as const,
};
