/**
 * `/admin/overview` (ADM-02, "Advisor insights" layout): URL filter bar, KPI strip, weekly line
 * chart (screened vs flagged), screenings by facility, "Screening type" and "Needs attention"
 * cards, a data note built only from the shown figures, the pilot-KPI card and the footnote.
 * Every number is an `AggregateCell` from `selectOverview` (suppressed cells show `<k`).
 */
import {
  METRIC_VERSION,
  pilotKpis,
  type AggregateCell,
  type MetricDefinitionId,
} from "@laif/analytics";
import { formatDate, formatNumber, formatTime, useLanguage } from "@laif/i18n";
import {
  Button,
  Card,
  EmptyState,
  ErrorState,
  errorCodeOf,
  LoadingSkeleton,
  MicroLabel,
  PageHeader,
  StatusChip,
  useTx,
  type TranslationKey,
} from "@laif/ui-web";
import type { ReactNode } from "react";
import { Link } from "react-router";

import { paths } from "../../app/nav.ts";
import { facilityLabel, reportingScopeLabel } from "../../app/persona-labels.ts";
import { useAdminSession, useServices } from "../../app/providers.tsx";
import { ScopeStrip } from "../../app/ScopeStrip.tsx";
import { resolveScopeFromSearch } from "../../auth/scope.ts";
import { ChartFrame } from "../../components/charts/ChartFrame.tsx";
import { ChartTable } from "../../components/charts/ChartTable.tsx";
import { CHART_SERIES } from "../../components/charts/chartTheme.ts";
import { HBarList } from "../../components/charts/HBarList.tsx";
import { LineTrend } from "../../components/charts/LineTrend.tsx";
import { DataNoteCallout } from "../../components/DataNoteCallout.tsx";
import { KpiStrip, KpiStripSkeleton, type KpiCell } from "../../components/KpiStrip.tsx";
import { MetricInfo } from "../../components/MetricInfo.tsx";
import { SuppressedValue, useCellText } from "../../components/SuppressedValue.tsx";
import { FilterBar, FilterNotice } from "../../features/filters/FilterBar.tsx";
import { serializeAdminFilters } from "../../features/filters/filterSchema.ts";
import { useAdminFilters, type AdminFiltersApi } from "../../features/filters/useAdminFilters.ts";
import {
  useMetricsFreshness,
  useOverviewMetrics,
  useRefreshMetrics,
  type OverviewResult,
} from "../../features/metrics/queries.ts";
import { deriveOverviewNote } from "../../features/metrics/selectOverview.ts";
import { useDocumentTitle } from "../useDocumentTitle.ts";

const pctOf = (cell: AggregateCell): number | null =>
  cell.suppressed || cell.value === null ? null : Math.round(cell.value * 100);

export function OverviewPage() {
  const t = useTx();
  const { language } = useLanguage();
  const { clock } = useServices();
  const persona = useAdminSession((s) => s.persona);
  const grant = useAdminSession((s) => s.grant);
  const session = useAdminSession((s) => s.session);
  const api = useAdminFilters();
  const query = useOverviewMetrics(api);
  const freshness = useMetricsFreshness(query.data?.lastWriteAt);
  const refresh = useRefreshMetrics();
  useDocumentTitle(t("admin:nav.overview"));

  const hour = Number(formatTime(clock.nowIso(), "en").slice(0, 2));
  const greetingKey =
    hour < 12
      ? "admin:overview.greeting.morning"
      : hour < 17
        ? "admin:overview.greeting.afternoon"
        : "admin:overview.greeting.evening";
  const scope =
    persona === null
      ? ""
      : reportingScopeLabel(persona, grant, session, resolveScopeFromSearch(api.searchString), t);

  return (
    <div className="flex flex-col gap-4" data-testid="overview-page">
      <div>
        <MicroLabel as="p" className="text-primary-dark">
          {t("admin:overview.eyebrow")}
        </MicroLabel>
        <PageHeader
          title={t(greetingKey, { name: persona?.displayName ?? "" })}
          subtitle={t("admin:overview.subtitle", {
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
        <OverviewSkeleton />
      ) : query.isError ? (
        <ErrorState
          code={errorCodeOf(query.error) ?? "INTERNAL"}
          message={t("admin:overview.error")}
          onRetry={() => query.refetch()}
        />
      ) : (
        <>
          <div className="flex flex-wrap items-center gap-3 text-xs">
            <span className="text-muted" data-testid="computed-stamp">
              {t("admin:overview.computed", { time: formatTime(query.data.asOf, language) })}
            </span>
            {freshness.stale ? (
              <Button variant="secondary" size="sm" icon="refresh" onClick={() => void refresh()}>
                {t("admin:overview.stale")}
              </Button>
            ) : null}
          </div>
          {query.data.empty ? (
            <EmptyOverview api={api} data={query.data} />
          ) : (
            <OverviewBody api={api} data={query.data} />
          )}
          <Footnote data={query.data} />
        </>
      )}
    </div>
  );
}

function OverviewSkeleton() {
  return (
    <div className="flex flex-col gap-4" data-testid="overview-loading" aria-busy="true">
      <KpiStripSkeleton />
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-12">
        <div className="min-h-[320px] lg:col-span-8">
          <LoadingSkeleton variant="card" lines={6} />
        </div>
        <div className="min-h-[320px] lg:col-span-4">
          <LoadingSkeleton variant="card" lines={6} />
        </div>
      </div>
    </div>
  );
}

function useKpis(data: OverviewResult): KpiCell[] {
  const t = useTx();
  const { language } = useLanguage();
  const cellText = useCellText();
  const k = data.threshold;
  const pct = (cell: AggregateCell, key: TranslationKey) => {
    const value = pctOf(cell);
    return value === null ? t("admin:overview.kpi.pctSuppressed") : t(key, { pct: value });
  };
  return [
    {
      id: "screened",
      label: t("admin:overview.kpi.screened"),
      value: data.totals.screened,
      sub: t("admin:overview.kpi.screenedSub", { people: cellText(data.peopleScreened, k) }),
    },
    {
      id: "flagged",
      label: t("admin:overview.kpi.flagged"),
      value: data.totals.flagged,
      sub: pct(data.rates.flaggedOfScreened, "admin:overview.kpi.flaggedSub"),
    },
    {
      id: "reviewed",
      label: t("admin:overview.kpi.reviewed"),
      value: data.totals.reviewed,
      sub: t("admin:overview.kpi.reviewedSub", {
        dismissed: cellText(data.totals.dismissed, k),
      }),
    },
    {
      id: "followUpCompleted",
      label: t("admin:overview.kpi.completed"),
      value: data.totals.followUpCompleted,
      sub: pct(data.rates.completedOfReferred, "admin:overview.kpi.completedSub"),
    },
    {
      id: "medianDaysToReview",
      label: t("admin:overview.kpi.median"),
      value: data.medianDaysToReview,
      n: data.totals.reviewed,
      format: (v) =>
        t("admin:overview.kpi.days", {
          days: formatNumber(v, language, { minimumFractionDigits: 1, maximumFractionDigits: 1 }),
        }),
      sub: t("admin:overview.kpi.medianSub", { n: cellText(data.totals.reviewed, k) }),
    },
  ];
}

function OverviewBody({ api, data }: { api: AdminFiltersApi; data: OverviewResult }) {
  const t = useTx();
  const { language } = useLanguage();
  const cellText = useCellText();
  const kpis = useKpis(data);
  const k = data.threshold;
  const info = (metric: MetricDefinitionId, n?: AggregateCell) => (
    <MetricInfo
      metric={metric}
      {...(n === undefined ? {} : { n })}
      threshold={k}
      computedAt={data.asOf}
      rulesetVersions={data.rulesetVersions}
    />
  );
  const weekLabel = (weekStart: string) => formatDate(`${weekStart}T12:00:00.000Z`, language);
  const suppressedWeeks = data.weekly.filter((w) => w.screened.suppressed || w.flagged.suppressed);
  const weeklySummary = t("admin:charts.weekly.summary", {
    weeks: data.weekly.length,
    screened: cellText(data.totals.screened, k),
    flagged: cellText(data.totals.flagged, k),
    suppressed: suppressedWeeks.length,
  });
  const facilitySummary = t("admin:charts.byFacility.summary", {
    count: data.facilities.length,
    total: cellText(data.totals.screened, k),
  });
  const note = deriveOverviewNote(data);
  const funnelLink = (facilityId: string) => {
    const search = serializeAdminFilters({ ...api.filters, facility: facilityId });
    return `${paths.funnel}${search}`;
  };

  return (
    <>
      <KpiStrip
        label={t("admin:overview.kpi.label")}
        items={kpis}
        threshold={k}
        computedAt={data.asOf}
        rulesetVersions={data.rulesetVersions}
      />
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-12">
        <div className="flex min-w-0 flex-col gap-4 lg:col-span-8">
          <ChartFrame
            testId="chart-weekly"
            title={t("admin:charts.weekly.title")}
            summary={weeklySummary}
            aside={info("weeklyScreenedVsFlagged")}
            legend={[
              {
                id: "screened",
                label: t("admin:charts.series.screened"),
                style: CHART_SERIES.screened,
              },
              {
                id: "flagged",
                label: t("admin:charts.series.flagged"),
                style: CHART_SERIES.flagged,
              },
            ]}
            chart={(size) => (
              <LineTrend
                {...size}
                data={data.weekly.map((w) => ({
                  x: weekLabel(w.weekStart),
                  screened: w.screened.suppressed ? null : w.screened.value,
                  flagged: w.flagged.suppressed ? null : w.flagged.value,
                }))}
                series={[
                  {
                    id: "screened",
                    label: t("admin:charts.series.screened"),
                    style: CHART_SERIES.screened,
                  },
                  {
                    id: "flagged",
                    label: t("admin:charts.series.flagged"),
                    style: CHART_SERIES.flagged,
                  },
                ]}
              />
            )}
            table={
              <ChartTable
                caption={t("admin:charts.weekly.title")}
                rows={data.weekly}
                getRowId={(w) => w.weekStart}
                columns={[
                  {
                    id: "week",
                    header: t("admin:charts.weekly.week"),
                    cell: (w) => weekLabel(w.weekStart),
                    isRowHeader: true,
                  },
                  {
                    id: "screened",
                    header: t("admin:charts.series.screened"),
                    align: "end",
                    cell: (w) => <SuppressedValue cell={w.screened} threshold={k} compact />,
                  },
                  {
                    id: "flagged",
                    header: t("admin:charts.series.flagged"),
                    align: "end",
                    cell: (w) => <SuppressedValue cell={w.flagged} threshold={k} compact />,
                  },
                ]}
              />
            }
          />
          <ChartFrame
            testId="chart-facility"
            html
            title={t("admin:charts.byFacility.title")}
            summary={facilitySummary}
            aside={info("screened")}
            chart={() => (
              <HBarList
                label={t("admin:charts.byFacility.title")}
                threshold={k}
                rows={data.facilities.map((f) => ({
                  id: f.facilityId,
                  label: facilityLabel(f.facilityId, t),
                  value: f.cells.screened,
                  to: funnelLink(f.facilityId),
                  linkLabel: t("admin:charts.byFacility.link", {
                    facility: facilityLabel(f.facilityId, t),
                  }),
                }))}
              />
            )}
            table={
              <ChartTable
                caption={t("admin:charts.byFacility.title")}
                rows={data.facilities}
                getRowId={(f) => f.facilityId}
                columns={[
                  {
                    id: "facility",
                    header: t("admin:charts.byFacility.facility"),
                    cell: (f) => facilityLabel(f.facilityId, t),
                    isRowHeader: true,
                  },
                  ...(
                    [
                      ["screened", "admin:charts.series.screened"],
                      ["flagged", "admin:charts.series.flagged"],
                      ["referred", "admin:charts.byFacility.referred"],
                      ["followUpCompleted", "admin:charts.byFacility.completed"],
                    ] as const
                  ).map(([metric, header]) => ({
                    id: metric,
                    header: t(header),
                    align: "end" as const,
                    cell: (f: (typeof data.facilities)[number]) => (
                      <SuppressedValue cell={f.cells[metric]} threshold={k} compact />
                    ),
                  })),
                ]}
              />
            }
          />
        </div>
        <div className="flex min-w-0 flex-col gap-4 lg:col-span-4">
          <ScreeningTypeCard data={data} info={info("screeningType", data.totals.screened)} />
          <NeedsAttentionCard api={api} data={data} />
          {note === null ? null : (
            <DataNoteCallout>
              {t("admin:overview.dataNote.text", {
                facility: facilityLabel(note.facilityId, t),
                completed: formatNumber(note.completed, language),
                referred: formatNumber(note.referred, language),
                pct: note.pct,
              })}
            </DataNoteCallout>
          )}
        </div>
      </div>
      <PilotKpiCard />
    </>
  );
}

function ScreeningTypeCard({ data, info }: { data: OverviewResult; info: ReactNode }) {
  const t = useTx();
  const k = data.threshold;
  const rows = data.screeningType.cells.filter((c) => c.key !== "neither" || c.value !== 0);
  return (
    <Card title={t("admin:overview.type.title")} meta={info} headingLevel={2}>
      <ul className="m-0 list-none space-y-2 p-0 text-[13px]" data-testid="screening-type">
        {rows.map((cell) => (
          <li key={cell.key} className="flex items-baseline justify-between gap-3">
            <span className="text-ink">
              {t(`admin:overview.type.${cell.key}` as TranslationKey)}
            </span>
            <span className="tabular-nums">
              <SuppressedValue cell={cell} threshold={k} />
            </span>
          </li>
        ))}
        {data.screeningType.total === null ? null : (
          <li className="border-border-soft flex items-baseline justify-between gap-3 border-t pt-2 font-semibold">
            <span>{t("admin:overview.type.total")}</span>
            <SuppressedValue cell={data.screeningType.total} threshold={k} />
          </li>
        )}
      </ul>
    </Card>
  );
}

function NeedsAttentionCard({ api, data }: { api: AdminFiltersApi; data: OverviewResult }) {
  const t = useTx();
  const k = data.threshold;
  const n = data.needsAttention;
  const search = api.searchString;
  const rows: Array<{ id: string; label: string; cell: AggregateCell; to: string }> = [
    {
      id: "overdueReferrals",
      label: t("admin:overview.attention.overdueReferrals"),
      cell: n.overdueReferrals,
      to: `${paths.timeliness}${search}`,
    },
    {
      id: "overdueFollowUps",
      label: t("admin:overview.attention.overdueFollowUps"),
      cell: n.overdueFollowUps,
      to: `${paths.timeliness}${search}`,
    },
    {
      id: "pendingReviewsAged8Plus",
      label: t("admin:overview.attention.pendingAged"),
      cell: n.pendingReviewAges["8+"],
      to: `${paths.timeliness}${search}`,
    },
    {
      id: "openQualityIssues",
      label: t("admin:overview.attention.quality"),
      cell: n.openQualityIssues,
      to: `${paths.quality}${search}`,
    },
  ];
  return (
    <Card title={t("admin:overview.attention.title")} headingLevel={2}>
      <ul className="m-0 list-none space-y-2 p-0 text-[13px]" data-testid="needs-attention">
        {rows.map((row) => (
          <li key={row.id} className="flex items-baseline justify-between gap-3">
            <Link to={row.to} className="text-primary-dark hover:underline">
              {row.label}
            </Link>
            <span className="tabular-nums">
              <SuppressedValue cell={row.cell} threshold={k} />
            </span>
          </li>
        ))}
      </ul>
      <p className="text-muted mt-3 mb-0 text-xs">{t("admin:overview.attention.note")}</p>
    </Card>
  );
}

function PilotKpiCard() {
  const t = useTx();
  return (
    <Card title={t("admin:overview.pilot.title")} headingLevel={2} variant="muted">
      <ul
        className="m-0 grid list-none gap-2 p-0 text-[13px] sm:grid-cols-2"
        data-testid="pilot-kpis"
      >
        {pilotKpis().map(({ kpi, definition }) => (
          <li key={kpi} className="flex flex-wrap items-center gap-2">
            <span className="font-mono text-xs">{kpi}</span>
            <span className="text-ink">{t(definition.labelKey as TranslationKey)}</span>
            {definition.status === "deferred" ? (
              <StatusChip tone="neutral">{t("admin:overview.pilot.deferred")}</StatusChip>
            ) : (
              <StatusChip tone="positive">
                {definition.shownIn === "ADM-02"
                  ? t("admin:overview.pilot.measuredHere")
                  : t(
                      `admin:overview.pilot.measuredIn.${definition.shownIn ?? "ADM-02"}` as TranslationKey,
                    )}
              </StatusChip>
            )}
          </li>
        ))}
      </ul>
    </Card>
  );
}

function EmptyOverview({ api, data }: { api: AdminFiltersApi; data: OverviewResult }) {
  const t = useTx();
  return (
    <div className="flex flex-col gap-4">
      <KpiStrip
        label={t("admin:overview.kpi.label")}
        items={[
          { id: "screened", label: t("admin:overview.kpi.screened"), value: data.totals.screened },
        ]}
        threshold={data.threshold}
        computedAt={data.asOf}
        rulesetVersions={data.rulesetVersions}
      />
      <EmptyState
        icon="calendar"
        title={t("admin:overview.empty.title")}
        description={t("admin:overview.empty.description")}
        action={
          <Button
            variant="secondary"
            onClick={() =>
              api.filters.preset === "ytd" ? api.reset() : api.setFilter({ preset: "ytd" })
            }
          >
            {t("admin:overview.empty.widen")}
          </Button>
        }
      />
    </div>
  );
}

function Footnote({ data }: { data: OverviewResult }) {
  const t = useTx();
  const { language } = useLanguage();
  return (
    <p className="text-muted m-0 text-xs" data-testid="overview-footnote">
      {t("admin:overview.footnote", {
        n: formatNumber(data.excludedConsentWithdrawn, language),
        version: METRIC_VERSION,
      })}
    </p>
  );
}
