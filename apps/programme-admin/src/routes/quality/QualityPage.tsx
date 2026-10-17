/**
 * `/admin/quality` (ADM-06, PA-06): monitor data and safety signals at aggregate level and triage
 * individual data-quality issues in a mock review queue — without patient identities.
 * - KPI strip (5): missing required fields, identity mismatches, overturned flags (PROXY),
 *   missed-flag proxy, duplicate submissions prevented.
 * - Left (8 cols): `IssueQueue` (tabs with counts, type chips, expandable rows, triage).
 * - Right (4 cols): missing fields by field, "Flag review outcomes" (PROXY), "Invariant checks",
 *   open issues per facility and the weekly trend; soft-blue "corrected at source" callout.
 * Clinical records are never edited here: corrections happen at source through amendment events
 * (FRD §4, T-06). Every number is an `AggregateCell` from `selectQuality` (one scope-wide pass).
 */
import { METRIC_VERSION, type AggregateCell, type MetricDefinitionId } from "@laif/analytics";
import { formatDate, formatNumber, formatTime, useLanguage } from "@laif/i18n";
import {
  Button,
  EmptyState,
  ErrorState,
  errorCodeOf,
  InfoCallout,
  LoadingSkeleton,
  MicroLabel,
  PageHeader,
  useTx,
} from "@laif/ui-web";
import type { ReactNode } from "react";

import { reportingScopeLabel } from "../../app/persona-labels.ts";
import { useAdminSession } from "../../app/providers.tsx";
import { ScopeStrip } from "../../app/ScopeStrip.tsx";
import { resolveScopeFromSearch } from "../../auth/scope.ts";
import { MetricInfo } from "../../components/MetricInfo.tsx";
import { FilterBar, FilterNotice } from "../../features/filters/FilterBar.tsx";
import { useAdminFilters, type AdminFiltersApi } from "../../features/filters/useAdminFilters.ts";
import { useMetricsFreshness, useRefreshMetrics } from "../../features/metrics/queries.ts";
import { FlagReviewOutcomes } from "../../features/quality/FlagReviewOutcomes.tsx";
import { InvariantChecks } from "../../features/quality/InvariantChecks.tsx";
import { IssueQueue } from "../../features/quality/IssueQueue.tsx";
import { MissingFieldBars } from "../../features/quality/MissingFieldBars.tsx";
import { OpenIssuesByFacility } from "../../features/quality/OpenIssuesByFacility.tsx";
import { QualityKpis, QualityKpisSkeleton } from "../../features/quality/QualityKpis.tsx";
import { QualityTrendChart } from "../../features/quality/QualityTrendChart.tsx";
import { useQualityMetrics, type QualityResult } from "../../features/quality/queries.ts";
import { useDocumentTitle } from "../useDocumentTitle.ts";

export function QualityPage() {
  const t = useTx();
  const { language } = useLanguage();
  const persona = useAdminSession((s) => s.persona);
  const grant = useAdminSession((s) => s.grant);
  const session = useAdminSession((s) => s.session);
  const api = useAdminFilters();
  const query = useQualityMetrics(api);
  const freshness = useMetricsFreshness(query.data?.lastWriteAt);
  const refresh = useRefreshMetrics();
  useDocumentTitle(t("admin:quality.title"));
  const scope =
    persona === null
      ? ""
      : reportingScopeLabel(persona, grant, session, resolveScopeFromSearch(api.searchString), t);

  return (
    <div className="flex flex-col gap-4" data-testid="quality-page">
      <div>
        <MicroLabel as="p" className="text-primary-dark">
          {t("admin:quality.eyebrow")}
        </MicroLabel>
        <PageHeader
          title={t("admin:quality.title")}
          subtitle={t("admin:quality.subtitle", {
            from: formatDate(`${api.period.from}T12:00:00.000Z`, language),
            to: formatDate(`${api.period.to}T12:00:00.000Z`, language),
            scope,
          })}
        />
      </div>
      <ScopeStrip />
      <FilterNotice api={api} />
      <FilterBar api={api} />
      {query.isPending ? (
        <QualitySkeleton />
      ) : query.isError ? (
        <ErrorState
          code={errorCodeOf(query.error) ?? "INTERNAL"}
          message={t("admin:quality.error")}
          onRetry={() => query.refetch()}
        />
      ) : (
        <>
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs">
            <span className="text-muted" data-testid="computed-stamp">
              {t("admin:overview.computed", { time: formatTime(query.data.asOf, language) })}
            </span>
            {freshness.stale ? (
              <Button variant="secondary" size="sm" icon="refresh" onClick={() => void refresh()}>
                {t("admin:overview.stale")}
              </Button>
            ) : null}
          </div>
          <QualityBody api={api} data={query.data} />
          <p className="text-muted m-0 text-xs" data-testid="quality-footnote">
            {t("admin:overview.footnote", {
              n: formatNumber(query.data.excludedConsentWithdrawn, language),
              version: METRIC_VERSION,
            })}
          </p>
        </>
      )}
    </div>
  );
}

function QualitySkeleton() {
  return (
    <div className="flex flex-col gap-4" data-testid="quality-loading" aria-busy="true">
      <QualityKpisSkeleton />
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-12">
        <div className="min-h-[320px] lg:col-span-8">
          <LoadingSkeleton variant="table" lines={8} />
        </div>
        <div className="min-h-[320px] lg:col-span-4">
          <LoadingSkeleton variant="card" lines={6} />
        </div>
      </div>
    </div>
  );
}

function QualityBody({ api, data }: { api: AdminFiltersApi; data: QualityResult }) {
  const t = useTx();
  const k = data.threshold;
  const info = (metric: MetricDefinitionId, n?: AggregateCell): ReactNode => (
    <MetricInfo
      metric={metric}
      {...(n === undefined ? {} : { n })}
      threshold={k}
      computedAt={data.asOf}
      rulesetVersions={data.rulesetVersions}
    />
  );
  return (
    <>
      <QualityKpis data={data} />
      {data.empty ? (
        <div data-testid="quality-empty">
          <EmptyState
            icon="check"
            title={t("admin:quality.empty")}
            description={t("admin:quality.emptyBody")}
          />
        </div>
      ) : null}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-12">
        <div className="flex min-w-0 flex-col gap-4 lg:col-span-8">
          <IssueQueue api={api} />
          <InfoCallout title={t("admin:quality.callout.title")} tone="info">
            <p className="m-0" data-testid="quality-callout">
              {t("admin:quality.callout.body")}
            </p>
          </InfoCallout>
        </div>
        <div className="flex min-w-0 flex-col gap-4 lg:col-span-4">
          <MissingFieldBars
            byField={data.byField}
            threshold={k}
            info={info("qualityMissingByField", data.kpis.missing)}
          />
          <FlagReviewOutcomes
            kpis={data.kpis}
            fairness={data.fairness}
            reasons={data.dismissalReasons}
            threshold={k}
            info={info("flagReviewOutcomesByGroup", data.kpis.reviewed)}
          />
          <InvariantChecks
            completedWithoutEvidence={data.invariants.completedWithoutEvidence}
            duplicateSubmissions={data.invariants.duplicateSubmissions}
            threshold={k}
          />
          <OpenIssuesByFacility
            rows={data.openByFacility}
            threshold={k}
            info={info("openQualityIssues", data.openTotal)}
          />
          <QualityTrendChart
            weeks={data.weekly}
            threshold={k}
            aside={info("weeklyQualityTrend", data.kpis.missing)}
          />
        </div>
      </div>
    </>
  );
}
