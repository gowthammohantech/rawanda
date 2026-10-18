/**
 * Report queries (ADM-07 task 11):
 * - `loadReportSections` — `assertScope` on the requested view FIRST, then the dataset of the
 *   actor's FULL grant scope (the same `adminKeys.dataset` cache entry the pages use; plus the
 *   baseline window for workload) and `buildReportSections` (page selectors, one scope-wide
 *   suppression pass). Shared by the preview and the export service.
 * - `useReportPreview` — `adminKeys.reportPreview(scopeKey, template, granularity, filters, …)`;
 *   labels are applied at render time (language switch needs no reload).
 * - `useExportHistory` — `adminKeys.exports(scopeKey)`.
 */
import { workloadBaselineWindow, type ReportGranularity } from "@laif/analytics";
import { useQuery, useQueryClient, type QueryClient } from "@tanstack/react-query";

import { useRepository, useServices } from "../../app/providers.tsx";
import { assertScope, grantDistrictIds } from "../../auth/scope.ts";
import { adminKeys } from "../../lib/queryKeys.ts";
import type { AdminFiltersApi } from "../filters/useAdminFilters.ts";
import type { ScopeAccess } from "../metrics/loadMetricsDataset.ts";
import {
  datasetOptions,
  filterKeyOf,
  useAccess,
  useSuppressionThreshold,
} from "../metrics/queries.ts";
import { buildReportSections, type ReportDatasets, type ReportSections } from "./reportSources.ts";
import type { ReportTemplateId } from "./templates.ts";

type Api = Pick<AdminFiltersApi, "filters" | "period">;
type Repo = ReturnType<typeof useRepository>;

export type ReportData = ReportSections & {
  template: ReportTemplateId;
  granularity: ReportGranularity;
  threshold: number;
  period: { from: string; to: string };
  /** Demo-clock instant of the read. */
  asOf: string;
};

export type LoadReportInput = {
  client: QueryClient;
  repo: Repo;
  access: ScopeAccess | null;
  scopeKey: string;
  api: Api;
  threshold: number;
  template: ReportTemplateId;
  granularity: ReportGranularity;
  /** Demo-clock instant (workload baseline window). */
  nowIso: string;
};

export async function loadReportSections(input: LoadReportInput): Promise<ReportData> {
  const { client, repo, access, scopeKey, api, threshold, template, granularity } = input;
  if (access === null) throw new Error("no admin session");
  assertScope(access.persona, access.grant, {
    districtIds: api.filters.district === null ? null : [api.filters.district],
    facilityIds: api.filters.facility === null ? null : [api.filters.facility],
  });
  const scopeFilters = { ...api.filters, district: null, facility: null };
  const loaded = await client.fetchQuery(
    datasetOptions(repo, access, scopeKey, { filters: scopeFilters, period: api.period }),
  );
  const datasets: ReportDatasets = { scope: loaded.dataset };
  if (template === "workload_facility") {
    const window = workloadBaselineWindow(new Date(input.nowIso));
    const baseline = await client.fetchQuery(
      datasetOptions(repo, access, scopeKey, {
        filters: { ...scopeFilters, preset: "custom" },
        period: window,
      }),
    );
    datasets.baseline = { dataset: baseline.dataset, window };
  }
  const built = buildReportSections({
    template,
    granularity,
    view: { district: api.filters.district, facility: api.filters.facility },
    threshold,
    datasets,
  });
  // Explicit scope ids, limited to districts the grant really covers (a facility-only grant
  // lists its facilities only).
  const grantDistricts = new Set(grantDistrictIds(access.persona, access.grant));
  return {
    ...built,
    districtIds: built.districtIds.filter((d) => grantDistricts.has(d)),
    template,
    granularity,
    threshold,
    period: api.period,
    asOf: loaded.asOf,
  };
}

/** Demo-clock minute (workload baseline / overdue figures; keeps query keys stable). */
export function useClockMinute(): string {
  const { clock } = useServices();
  return clock.nowIso().slice(0, 16);
}

export function useReportPreview(
  api: Api,
  template: ReportTemplateId,
  granularity: ReportGranularity,
  enabled = true,
) {
  const repo = useRepository();
  const client = useQueryClient();
  const threshold = useSuppressionThreshold();
  const { access, scopeKey } = useAccess();
  const minute = useClockMinute();
  return useQuery({
    queryKey: adminKeys.reportPreview(
      scopeKey,
      template,
      granularity,
      filterKeyOf(api),
      threshold,
      template === "workload_facility" ? minute : null,
    ),
    queryFn: () =>
      loadReportSections({
        client,
        repo,
        access,
        scopeKey,
        api,
        threshold,
        template,
        granularity,
        nowIso: `${minute}:00.000Z`,
      }),
    enabled: enabled && access !== null,
    retry: false,
  });
}

export function useExportHistory() {
  const repo = useRepository();
  const { access, scopeKey } = useAccess();
  return useQuery({
    queryKey: adminKeys.exports(scopeKey),
    queryFn: () => repo.listExportAudits(),
    enabled: access !== null,
    retry: false,
  });
}
