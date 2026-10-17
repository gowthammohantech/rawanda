/**
 * Safety & quality queries (ADM-06 task 8):
 * - `useQualityMetrics` — `adminKeys.quality(scopeKey, filters, threshold)`: checks the requested
 *   scope first (`assertScope`), reads the dataset of the actor's FULL grant scope (shared
 *   `adminKeys.dataset` cache) and selects the view (`selectQuality`, one scope-wide pass).
 * - `useQualityIssues` — `adminKeys.qualityIssues(scopeKey, filters, tab, page)`: detects the
 *   issues of the grant scope (`detectQualityIssues`, deterministic ids), upserts them in the
 *   query function (`upsertDetectedIssues` inserts new ids only and never resets a triage; other
 *   cached queue pages are marked stale when something new was found), then joins the stored
 *   triage state and picks the view's tab / type / page.
 */
import { detectQualityIssues } from "@laif/analytics";
import type { DataQualityIssueStatus, DataQualityIssueType } from "@laif/contracts";
import { useQuery, useQueryClient, type QueryClient } from "@tanstack/react-query";

import { useRepository } from "../../app/providers.tsx";
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
import {
  queueIssues,
  selectQuality,
  selectQueue,
  type QueueSelection,
  type QualityView,
} from "./selectQuality.ts";

type Api = Pick<AdminFiltersApi, "filters" | "period">;
type Repo = ReturnType<typeof useRepository>;

export type QualityResult = QualityView & { asOf: string; lastWriteAt: string | null };

/** The grant-scope dataset after the requested-scope check (403 for an out-of-scope filter). */
async function scopeDataset(
  client: QueryClient,
  repo: Repo,
  access: ScopeAccess | null,
  scopeKey: string,
  api: Api,
) {
  if (access === null) throw new Error("no admin session");
  assertScope(access.persona, access.grant, {
    districtIds: api.filters.district === null ? null : [api.filters.district],
    facilityIds: api.filters.facility === null ? null : [api.filters.facility],
  });
  return client.fetchQuery(
    datasetOptions(repo, access, scopeKey, {
      filters: { ...api.filters, district: null, facility: null },
      period: api.period,
    }),
  );
}

export function useQualityMetrics(api: Api) {
  const repo = useRepository();
  const client = useQueryClient();
  const threshold = useSuppressionThreshold();
  const { access, scopeKey } = useAccess();
  return useQuery({
    queryKey: adminKeys.quality(scopeKey, filterKeyOf(api), threshold),
    queryFn: async (): Promise<QualityResult> => {
      const loaded = await scopeDataset(client, repo, access, scopeKey, api);
      return {
        ...selectQuality(
          loaded.dataset,
          { district: api.filters.district, facility: api.filters.facility },
          threshold,
        ),
        asOf: loaded.asOf,
        lastWriteAt: loaded.lastWriteAt,
      };
    },
    enabled: access !== null,
    retry: false,
  });
}

export type QueueQuery = {
  tab: DataQualityIssueStatus;
  type: DataQualityIssueType | null;
  page: number;
};

export function useQualityIssues(api: Api, queue: QueueQuery) {
  const repo = useRepository();
  const client = useQueryClient();
  const { access, scopeKey } = useAccess();
  const queryKey = adminKeys.qualityIssues(
    scopeKey,
    { ...filterKeyOf(api), issueType: queue.type },
    queue.tab,
    queue.page,
  );
  return useQuery({
    queryKey,
    queryFn: async (): Promise<QueueSelection> => {
      const loaded = await scopeDataset(client, repo, access, scopeKey, api);
      const detected = detectQualityIssues(loaded.dataset);
      const upsert = await repo.upsertDetectedIssues(detected);
      if (upsert.inserted.length > 0) {
        await client.invalidateQueries({
          queryKey: adminKeys.qualityIssuesAll(scopeKey),
          refetchType: "none",
        });
      }
      const stored =
        detected.length === 0
          ? []
          : await repo.listQualityIssues({ ids: detected.map((i) => i.id) });
      const issues = queueIssues(
        loaded.dataset,
        { district: api.filters.district, facility: api.filters.facility },
        stored,
      );
      return selectQueue(issues, queue.tab, queue.type, queue.page);
    },
    enabled: access !== null,
    retry: false,
    // Keep the rows while switching tab / page of the SAME filters (never across filters).
    placeholderData: (previous, previousQuery) =>
      previousQuery !== undefined &&
      JSON.stringify(previousQuery.queryKey.slice(0, -2)) === JSON.stringify(queryKey.slice(0, -2))
        ? previous
        : undefined,
  });
}
