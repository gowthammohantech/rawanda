/**
 * Metric queries (ADM-02 tasks 4, 11):
 * - `useMetricsDataset` — the scoped dataset (`adminKeys.dataset`);
 * - `useOverviewMetrics` — derived from the dataset by `selectOverview`; its key carries the
 *   suppression threshold, so a threshold change recomputes (ADM-09 edits it);
 * - `useMetricsFreshness` — "Data changed — Refresh" when a source write is newer than the data.
 * Errors are never replaced by cached numbers from another key (no fabricated figures).
 */
import { DEMO_SMALL_CELL_THRESHOLD } from "@laif/analytics";
import { useQuery, useQueryClient, type QueryClient } from "@tanstack/react-query";

import { useAdminSession, useRepository } from "../../app/providers.tsx";
import { adminKeys, scopeKeyOf, type FilterKey } from "../../lib/queryKeys.ts";
import type { AdminFiltersApi } from "../filters/useAdminFilters.ts";
import { loadMetricsDataset, type LoadedDataset, type ScopeAccess } from "./loadMetricsDataset.ts";
import { selectOverview, type OverviewMetrics } from "./selectOverview.ts";

/**
 * The small-cell threshold in force. ADM-09 adds the settings UI; until then it is the demo
 * default (`DEMO_SMALL_CELL_THRESHOLD`, pending data-governance approval).
 */
export function useSuppressionThreshold(): number {
  return DEMO_SMALL_CELL_THRESHOLD;
}

export function filterKeyOf(api: Pick<AdminFiltersApi, "filters" | "period">): FilterKey {
  return { ...api.filters, periodFrom: api.period.from, periodTo: api.period.to };
}

export function useAccess(): { access: ScopeAccess | null; scopeKey: string } {
  const persona = useAdminSession((s) => s.persona);
  const grant = useAdminSession((s) => s.grant);
  return {
    access: persona === null ? null : { persona, grant },
    scopeKey: scopeKeyOf(grant),
  };
}

export function datasetOptions(
  repo: ReturnType<typeof useRepository>,
  access: ScopeAccess | null,
  scopeKey: string,
  api: Pick<AdminFiltersApi, "filters" | "period">,
) {
  return {
    queryKey: adminKeys.dataset(scopeKey, filterKeyOf(api)),
    queryFn: (): Promise<LoadedDataset> => {
      if (access === null) throw new Error("no admin session");
      return loadMetricsDataset(repo, access, api.filters, api.period);
    },
  };
}

export function useMetricsDataset(api: Pick<AdminFiltersApi, "filters" | "period">) {
  const repo = useRepository();
  const { access, scopeKey } = useAccess();
  return useQuery({ ...datasetOptions(repo, access, scopeKey, api), enabled: access !== null });
}

export type OverviewResult = OverviewMetrics & { asOf: string; lastWriteAt: string | null };

/**
 * Scope-wide suppression (ADM-03, as the funnel): the overview of a district / facility is picked
 * from ONE suppression pass over the dataset of the actor's FULL grant scope (`selectOverview`),
 * so differencing two views reveals nothing hidden. The view's own dataset (loaded through the
 * same `assertScope`-guarded loader, shared cache) supplies the non-additive footnotes.
 */
async function computeOverview(
  client: QueryClient,
  repo: ReturnType<typeof useRepository>,
  access: ScopeAccess | null,
  scopeKey: string,
  api: Pick<AdminFiltersApi, "filters" | "period">,
  threshold: number,
): Promise<OverviewResult> {
  const view = await client.fetchQuery(datasetOptions(repo, access, scopeKey, api));
  const scopeApi = {
    filters: { ...api.filters, district: null, facility: null },
    period: api.period,
  };
  const scope = await client.fetchQuery(datasetOptions(repo, access, scopeKey, scopeApi));
  return {
    ...selectOverview(scope.dataset, threshold, {
      view: { district: api.filters.district, facility: api.filters.facility },
      viewDataset: view.dataset,
    }),
    asOf: scope.asOf,
    lastWriteAt: scope.lastWriteAt,
  };
}

export function useOverviewMetrics(api: Pick<AdminFiltersApi, "filters" | "period">) {
  const repo = useRepository();
  const client = useQueryClient();
  const threshold = useSuppressionThreshold();
  const { access, scopeKey } = useAccess();
  return useQuery({
    queryKey: adminKeys.overview(scopeKey, filterKeyOf(api), threshold),
    queryFn: () => computeOverview(client, repo, access, scopeKey, api, threshold),
    enabled: access !== null,
    // A retry re-reads the dataset (a failed dataset read is not cached).
    retry: false,
  });
}

/** Polls the latest source write; `stale` when it is newer than the displayed data. */
export function useMetricsFreshness(dataLastWriteAt: string | null | undefined) {
  const repo = useRepository();
  const { access, scopeKey } = useAccess();
  const query = useQuery({
    queryKey: adminKeys.freshness(scopeKey),
    queryFn: () => repo.getMetricsFreshness(),
    enabled: access !== null && dataLastWriteAt !== undefined,
    refetchInterval: 20_000,
    refetchOnWindowFocus: true,
    staleTime: 0,
  });
  const latest = query.data?.lastWriteAt ?? null;
  const stale =
    dataLastWriteAt !== undefined &&
    latest !== null &&
    (dataLastWriteAt === null || latest > dataLastWriteAt);
  return { stale };
}

/** Drops every scoped admin query (the stale chip's "Refresh"). */
export function useRefreshMetrics(): () => Promise<void> {
  const client = useQueryClient();
  return () => client.invalidateQueries({ queryKey: adminKeys.scoped });
}
