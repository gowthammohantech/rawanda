/**
 * Timeliness query (ADM-04 task 5): `useTimelinessMetrics` —
 * `adminKeys.timeliness(scopeKey, filters, nowIso, threshold)`. Like the funnel it reads the
 * dataset of the actor's FULL grant scope (`adminKeys.dataset` with no district / facility —
 * shared with the overview cache) after checking the requested scope (`assertScope`), then
 * selects the view (`selectTimeliness`), so suppression is identical across views and pages.
 */
import { useQuery, useQueryClient, type QueryClient } from "@tanstack/react-query";

import { useRepository, useServices } from "../../app/providers.tsx";
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
import { selectTimeliness, type TimelinessView } from "./selectTimeliness.ts";

type Api = Pick<AdminFiltersApi, "filters" | "period">;

export type TimelinessResult = TimelinessView & { asOf: string; lastWriteAt: string | null };

async function loadTimeliness(
  client: QueryClient,
  repo: ReturnType<typeof useRepository>,
  access: ScopeAccess | null,
  scopeKey: string,
  api: Api,
  threshold: number,
): Promise<TimelinessResult> {
  if (access === null) throw new Error("no admin session");
  assertScope(access.persona, access.grant, {
    districtIds: api.filters.district === null ? null : [api.filters.district],
    facilityIds: api.filters.facility === null ? null : [api.filters.facility],
  });
  const loaded = await client.fetchQuery(
    datasetOptions(repo, access, scopeKey, {
      filters: { ...api.filters, district: null, facility: null },
      period: api.period,
    }),
  );
  return {
    ...selectTimeliness(
      loaded.dataset,
      { district: api.filters.district, facility: api.filters.facility },
      threshold,
    ),
    asOf: loaded.asOf,
    lastWriteAt: loaded.lastWriteAt,
  };
}

export function useTimelinessMetrics(api: Api) {
  const repo = useRepository();
  const client = useQueryClient();
  const { clock } = useServices();
  const threshold = useSuppressionThreshold();
  const { access, scopeKey } = useAccess();
  // To the minute: the ticking demo clock would otherwise make a new key on every render.
  const nowIso = clock.nowIso().slice(0, 16);
  const queryKey = adminKeys.timeliness(scopeKey, filterKeyOf(api), nowIso, threshold);
  return useQuery({
    queryKey,
    queryFn: () => loadTimeliness(client, repo, access, scopeKey, api, threshold),
    enabled: access !== null,
    retry: false,
    // Keep the figures on screen while only the minute moved on (never across scope / filters).
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
