/**
 * Workload query (ADM-05 task 7): `useWorkloadMetrics` —
 * `adminKeys.workload(scopeKey, filters, nowIso, threshold)`. Like Timeliness it checks the
 * requested scope first (`assertScope`), reads the dataset of the actor's FULL grant scope (shared
 * `adminKeys.dataset` cache) plus the same scope over the DEMO BASELINE window, then selects the
 * view (`selectWorkload`, one scope-wide suppression pass). Worker rows are only computed for
 * roles holding `metrics.drilldown`.
 */
import { workloadBaselineWindow } from "@laif/analytics";
import { checkAccess } from "@laif/auth-demo";
import { useQuery, useQueryClient, type QueryClient } from "@tanstack/react-query";

import { useRepository, useServices, useSessionStore } from "../../app/providers.tsx";
import { assertScope } from "../../auth/scope.ts";
import { adminKeys } from "../../lib/queryKeys.ts";
import type { AdminFiltersApi } from "../filters/useAdminFilters.ts";
import type { ScopeAccess } from "../metrics/loadMetricsDataset.ts";
import {
  datasetOptions,
  filterKeyOf,
  useAccess,
  useSuppressionThreshold,
} from "../metrics/queries.ts";
import { selectWorkload, type WorkloadView } from "./selectWorkload.ts";

type Api = Pick<AdminFiltersApi, "filters" | "period">;

export type WorkloadResult = WorkloadView & { asOf: string; lastWriteAt: string | null };

async function loadWorkload(
  client: QueryClient,
  repo: ReturnType<typeof useRepository>,
  access: ScopeAccess | null,
  scopeKey: string,
  api: Api,
  threshold: number,
  includeWorkers: boolean,
  nowIso: string,
): Promise<WorkloadResult> {
  if (access === null) throw new Error("no admin session");
  assertScope(access.persona, access.grant, {
    districtIds: api.filters.district === null ? null : [api.filters.district],
    facilityIds: api.filters.facility === null ? null : [api.filters.facility],
  });
  const scopeFilters = { ...api.filters, district: null, facility: null };
  const loaded = await client.fetchQuery(
    datasetOptions(repo, access, scopeKey, { filters: scopeFilters, period: api.period }),
  );
  const baselineWindow = workloadBaselineWindow(new Date(nowIso));
  const baseline = await client.fetchQuery(
    datasetOptions(repo, access, scopeKey, {
      filters: { ...scopeFilters, preset: "custom" },
      period: baselineWindow,
    }),
  );
  return {
    ...selectWorkload(
      loaded.dataset,
      { district: api.filters.district, facility: api.filters.facility },
      threshold,
      { includeWorkers, baseline: baseline.dataset, baselineWindow },
    ),
    asOf: loaded.asOf,
    lastWriteAt: loaded.lastWriteAt,
  };
}

/** `metrics.drilldown` (programme lead, district analyst, facility manager; not the auditor). */
export function useCanDrillDown(): boolean {
  const store = useSessionStore();
  const actor = store.actor();
  return actor !== null && checkAccess(actor, "metrics.drilldown").allowed;
}

export function useWorkloadMetrics(api: Api) {
  const repo = useRepository();
  const client = useQueryClient();
  const { clock } = useServices();
  const threshold = useSuppressionThreshold();
  const { access, scopeKey } = useAccess();
  const includeWorkers = useCanDrillDown();
  // To the minute: the ticking demo clock would otherwise make a new key on every render.
  const nowIso = clock.nowIso().slice(0, 16);
  const queryKey = adminKeys.workload(scopeKey, filterKeyOf(api), nowIso, threshold);
  return useQuery({
    queryKey,
    queryFn: () =>
      loadWorkload(
        client,
        repo,
        access,
        scopeKey,
        api,
        threshold,
        includeWorkers,
        `${nowIso}:00.000Z`,
      ),
    enabled: access !== null,
    retry: false,
    placeholderData: (previous, previousQuery) =>
      previousQuery !== undefined && sameExceptNow(previousQuery.queryKey, queryKey)
        ? previous
        : undefined,
  });
}

function sameExceptNow(a: readonly unknown[], b: readonly unknown[]): boolean {
  const strip = (k: readonly unknown[]) => JSON.stringify(k.filter((_, i) => i !== k.length - 2));
  return a.length === b.length && strip(a) === strip(b);
}
