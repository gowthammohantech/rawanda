/**
 * Funnel queries (ADM-03 task 9):
 * - `useFunnel` — `adminKeys.funnel(scopeKey, filters, threshold)`;
 * - `useFunnelStage` — `adminKeys.funnelStage(scopeKey, stage, filters, threshold)`: the stage
 *   view plus the previous equal-length period (KPI "change").
 * Both derive from the dataset of the actor's FULL grant scope (`adminKeys.dataset` with no
 * district / facility — shared with the all-districts overview cache) and select the requested
 * district / facility afterwards, so suppression is identical across views (see
 * `selectFunnel`). The requested scope is still checked first (`assertScope`), as in ADM-02.
 */
import type { FunnelStageId } from "@laif/analytics";
import { useQuery, useQueryClient, type QueryClient } from "@tanstack/react-query";

import { useRepository } from "../../app/providers.tsx";
import { assertScope } from "../../auth/scope.ts";
import { adminKeys } from "../../lib/queryKeys.ts";
import type { AdminFilters, Period } from "../filters/filterSchema.ts";
import type { AdminFiltersApi } from "../filters/useAdminFilters.ts";
import type { ScopeAccess } from "../metrics/loadMetricsDataset.ts";
import {
  datasetOptions,
  filterKeyOf,
  useAccess,
  useSuppressionThreshold,
} from "../metrics/queries.ts";
import { previousPeriod, selectFunnel, type FunnelView } from "./selectFunnel.ts";

type Api = Pick<AdminFiltersApi, "filters" | "period">;

export type FunnelResult = FunnelView & { asOf: string; lastWriteAt: string | null };
export type FunnelStageResult = {
  stage: FunnelStageId;
  current: FunnelResult;
  previous: FunnelView;
  previousPeriod: Period;
};

const scopeWide = (filters: AdminFilters): AdminFilters => ({
  ...filters,
  district: null,
  facility: null,
});

async function loadView(
  client: QueryClient,
  repo: ReturnType<typeof useRepository>,
  access: ScopeAccess | null,
  scopeKey: string,
  api: Api,
  threshold: number,
): Promise<FunnelResult> {
  if (access === null) throw new Error("no admin session");
  assertScope(access.persona, access.grant, {
    districtIds: api.filters.district === null ? null : [api.filters.district],
    facilityIds: api.filters.facility === null ? null : [api.filters.facility],
  });
  const loaded = await client.fetchQuery(
    datasetOptions(repo, access, scopeKey, {
      filters: scopeWide(api.filters),
      period: api.period,
    }),
  );
  return {
    ...selectFunnel(
      loaded.dataset,
      { district: api.filters.district, facility: api.filters.facility },
      threshold,
    ),
    asOf: loaded.asOf,
    lastWriteAt: loaded.lastWriteAt,
  };
}

export function useFunnel(api: Api) {
  const repo = useRepository();
  const client = useQueryClient();
  const threshold = useSuppressionThreshold();
  const { access, scopeKey } = useAccess();
  return useQuery({
    queryKey: adminKeys.funnel(scopeKey, filterKeyOf(api), threshold),
    queryFn: () => loadView(client, repo, access, scopeKey, api, threshold),
    enabled: access !== null,
    retry: false,
  });
}

export function useFunnelStage(api: Api, stage: FunnelStageId) {
  const repo = useRepository();
  const client = useQueryClient();
  const threshold = useSuppressionThreshold();
  const { access, scopeKey } = useAccess();
  return useQuery({
    queryKey: adminKeys.funnelStage(scopeKey, stage, filterKeyOf(api), threshold),
    queryFn: async (): Promise<FunnelStageResult> => {
      const current = await loadView(client, repo, access, scopeKey, api, threshold);
      const prev = previousPeriod(api.period);
      const previous = await loadView(
        client,
        repo,
        access,
        scopeKey,
        {
          filters: { ...api.filters, preset: "custom", from: prev.from, to: prev.to },
          period: prev,
        },
        threshold,
      );
      return { stage, current, previous, previousPeriod: prev };
    },
    enabled: access !== null,
    retry: false,
  });
}
