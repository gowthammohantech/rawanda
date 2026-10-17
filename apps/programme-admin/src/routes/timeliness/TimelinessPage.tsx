/**
 * `/admin/timeliness` (ADM-04, PA-04): how long flagged screenings take to be clinically reviewed
 * and how many follow-up steps are past their clinician-set due date — aggregates only.
 * KPI strip (median / p90 days to review, reviews pending, overdue referrals / follow-ups, median
 * days to referral completion), the weekly median trend and the weekly overdue trend (left), the
 * pending-review age buckets (never called overdue: no approved review target), the facility
 * medians and the "what overdue means" callout (right). Every number is an `AggregateCell` from
 * `selectTimeliness` (one scope-wide suppression pass; the overdue figures are the same cells as
 * the overview's "Needs attention" card).
 */
import { METRIC_VERSION, type AggregateCell, type MetricDefinitionId } from "@laif/analytics";
import { formatDate, formatDateTime, formatNumber, formatTime, useLanguage } from "@laif/i18n";
import {
  Button,
  ErrorState,
  errorCodeOf,
  Icon,
  InfoCallout,
  LoadingSkeleton,
  MicroLabel,
  PageHeader,
  useTx,
} from "@laif/ui-web";
import type { ReactNode } from "react";

import { paths } from "../../app/nav.ts";
import { reportingScopeLabel } from "../../app/persona-labels.ts";
import { useAdminSession } from "../../app/providers.tsx";
import { ScopeStrip } from "../../app/ScopeStrip.tsx";
import { resolveScopeFromSearch } from "../../auth/scope.ts";
import { KpiStrip, KpiStripSkeleton, type KpiCell } from "../../components/KpiStrip.tsx";
import { MetricInfo } from "../../components/MetricInfo.tsx";
import { useCellText } from "../../components/SuppressedValue.tsx";
import { FilterBar, FilterNotice } from "../../features/filters/FilterBar.tsx";
import { useAdminFilters, type AdminFiltersApi } from "../../features/filters/useAdminFilters.ts";
import { useMetricsFreshness, useRefreshMetrics } from "../../features/metrics/queries.ts";
import { AgingBuckets } from "../../features/timeliness/AgingBuckets.tsx";
import { FacilityMedianList } from "../../features/timeliness/FacilityMedianList.tsx";
import { useDaysFormat } from "../../features/timeliness/format.ts";
import { MedianTrendChart } from "../../features/timeliness/MedianTrendChart.tsx";
import { OverdueTrendChart } from "../../features/timeliness/OverdueTrendChart.tsx";
import { useTimelinessMetrics, type TimelinessResult } from "../../features/timeliness/queries.ts";
import { useDocumentTitle } from "../useDocumentTitle.ts";

export function TimelinessPage() {
  const t = useTx();
  const { language } = useLanguage();
  const persona = useAdminSession((s) => s.persona);
  const grant = useAdminSession((s) => s.grant);
  const session = useAdminSession((s) => s.session);
  const api = useAdminFilters();
  const query = useTimelinessMetrics(api);
  const freshness = useMetricsFreshness(query.data?.lastWriteAt);
  const refresh = useRefreshMetrics();
  useDocumentTitle(t("admin:nav.timeliness"));
  const scope =
    persona === null
      ? ""
      : reportingScopeLabel(persona, grant, session, resolveScopeFromSearch(api.searchString), t);

  return (
    <div className="flex flex-col gap-4" data-testid="timeliness-page">
      <div>
        <MicroLabel as="p" className="text-primary-dark">
          {t("admin:timeliness.eyebrow")}
        </MicroLabel>
        <PageHeader
          title={t("admin:timeliness.title")}
          subtitle={t("admin:timeliness.subtitle", {
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
        <TimelinessSkeleton />
      ) : query.isError ? (
        <ErrorState
          code={errorCodeOf(query.error) ?? "INTERNAL"}
          message={t("admin:timeliness.error")}
          onRetry={() => query.refetch()}
        />
      ) : (
        <>
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs">
            <span className="text-muted" data-testid="computed-stamp">
              {t("admin:overview.computed", { time: formatTime(query.data.asOf, language) })}
            </span>
            <span className="text-muted" data-testid="as-of">
              {t("admin:timeliness.asOf", {
                datetime: formatDateTime(query.data.computedAt, language),
              })}
            </span>
            <span className="text-muted">{t("admin:timeliness.demoClock")}</span>
            {freshness.stale ? (
              <Button variant="secondary" size="sm" icon="refresh" onClick={() => void refresh()}>
                {t("admin:overview.stale")}
              </Button>
            ) : null}
          </div>
          <TimelinessBody api={api} data={query.data} />
          <p className="text-muted m-0 text-xs" data-testid="timeliness-footnote">
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

function TimelinessSkeleton() {
  return (
    <div className="flex flex-col gap-4" data-testid="timeliness-loading" aria-busy="true">
      <KpiStripSkeleton />
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-12">
        <div className="flex min-h-[320px] flex-col gap-4 lg:col-span-8">
          <LoadingSkeleton variant="card" lines={6} />
          <LoadingSkeleton variant="card" lines={6} />
        </div>
        <div className="min-h-[320px] lg:col-span-4">
          <LoadingSkeleton variant="card" lines={6} />
        </div>
      </div>
    </div>
  );
}

function NoneOverdue() {
  const t = useTx();
  return (
    <span className="text-positive inline-flex items-center gap-1" data-testid="none-overdue">
      <Icon name="check" size={14} />
      {t("admin:timeliness.kpi.noneOverdue")}
    </span>
  );
}

const isZero = (c: AggregateCell): boolean => !c.suppressed && c.value === 0;

function useKpis(api: AdminFiltersApi, data: TimelinessResult): KpiCell[] {
  const t = useTx();
  const days = useDaysFormat();
  const cellText = useCellText({ short: true });
  const k = data.threshold;
  const { kpis } = data;
  const drillDown = {
    to: `${paths.funnelStage("referred")}${api.searchString}`,
    label: t("admin:timeliness.kpi.overdueLink"),
  };
  return [
    {
      id: "medianDaysToReview",
      label: t("admin:timeliness.kpi.median"),
      value: kpis.median,
      n: kpis.reviews,
      derived: true,
      format: days,
      sub: data.noReviews
        ? t("admin:timeliness.kpi.noReviews")
        : t("admin:timeliness.kpi.medianSub", { n: cellText(kpis.reviews, k) }),
    },
    {
      id: "p90DaysToReview",
      label: t("admin:timeliness.kpi.p90"),
      value: kpis.p90,
      n: kpis.reviews,
      derived: true,
      format: days,
      sub: t("admin:timeliness.kpi.p90Sub"),
    },
    {
      id: "reviewsPending",
      label: t("admin:timeliness.kpi.pending"),
      value: kpis.pending,
      sub: t("admin:timeliness.kpi.pendingSub", { n: cellText(kpis.pendingAged8Plus, k) }),
    },
    {
      id: "overdueReferrals",
      label: t("admin:timeliness.kpi.overdueReferrals"),
      value: kpis.overdueReferrals,
      ...(isZero(kpis.overdueReferrals) ? { sub: <NoneOverdue /> } : {}),
      link: drillDown,
    },
    {
      id: "overdueFollowUps",
      label: t("admin:timeliness.kpi.overdueFollowUps"),
      value: kpis.overdueFollowUps,
      ...(isZero(kpis.overdueFollowUps) ? { sub: <NoneOverdue /> } : {}),
      link: drillDown,
    },
    {
      id: "medianDaysToReferralCompletion",
      label: t("admin:timeliness.kpi.completion"),
      value: kpis.referralCompletionMedian,
      n: kpis.referralCompletions,
      derived: true,
      format: days,
      sub: t("admin:timeliness.kpi.completionSub", {
        n: cellText(kpis.referralCompletions, k),
      }),
    },
  ];
}

function TimelinessBody({ api, data }: { api: AdminFiltersApi; data: TimelinessResult }) {
  const t = useTx();
  const kpis = useKpis(api, data);
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
      <KpiStrip
        label={t("admin:timeliness.kpi.label")}
        items={kpis}
        threshold={k}
        computedAt={data.asOf}
        rulesetVersions={data.rulesetVersions}
      />
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-12">
        <div className="flex min-w-0 flex-col gap-4 lg:col-span-8">
          <MedianTrendChart
            weeks={data.medianTrend}
            threshold={k}
            aside={info("weeklyMedianDaysToReview", data.kpis.reviews)}
          />
          <OverdueTrendChart
            weeks={data.overdueTrend}
            threshold={k}
            aside={info("weeklyOverdueTrend")}
          />
        </div>
        <div className="flex min-w-0 flex-col gap-4 lg:col-span-4">
          <AgingBuckets
            buckets={data.aging}
            total={data.kpis.pending}
            threshold={k}
            info={info("pendingReviewAge", data.kpis.pending)}
          />
          <FacilityMedianList
            rows={data.facilities}
            threshold={k}
            filters={api.filters}
            aside={info("medianDaysByFacility")}
          />
          <InfoCallout title={t("admin:timeliness.callout.title")} tone="info">
            <p data-testid="overdue-callout">{t("admin:timeliness.callout.text")}</p>
          </InfoCallout>
        </div>
      </div>
    </>
  );
}
