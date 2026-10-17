/**
 * `/admin/workload` (ADM-05, PA-05, BO-03): how much follow-up work is assigned to and completed
 * by health workers, and a STAFF-TIME PROXY (self-reported demo minutes per patient-day) — to
 * spot burden, NOT to rate individuals.
 * - Workers appear only as pseudonymous codes (`HW-014`); never names, tasks or patients.
 * - The worker table needs `metrics.drilldown` (programme lead, district analyst, facility
 *   manager — the facility manager's grant limits it to their facility); the auditor sees the
 *   aggregates with an explanation in its place. Rendering it emits `admin.drilldown.viewed`
 *   once per (session, filters) — a sensitive staff-level read.
 * - Every time figure carries the mono `PROXY` pill and the disclaimer callout; no ranking UI.
 * Every number is an `AggregateCell` from `selectWorkload` (one scope-wide suppression pass).
 */
import { METRIC_VERSION, type AggregateCell, type MetricDefinitionId } from "@laif/analytics";
import { formatDate, formatDateTime, formatNumber, formatTime, useLanguage } from "@laif/i18n";
import {
  Button,
  Card,
  EmptyState,
  ErrorState,
  errorCodeOf,
  InfoCallout,
  LoadingSkeleton,
  MicroLabel,
  PageHeader,
  useToast,
  useTx,
} from "@laif/ui-web";
import { useEffect, type ReactNode } from "react";

import { reportingScopeLabel } from "../../app/persona-labels.ts";
import { useAdminSession, useServices } from "../../app/providers.tsx";
import { ScopeStrip } from "../../app/ScopeStrip.tsx";
import { resolveScopeFromSearch } from "../../auth/scope.ts";
import { KpiStrip, KpiStripSkeleton, type KpiCell } from "../../components/KpiStrip.tsx";
import { MetricInfo } from "../../components/MetricInfo.tsx";
import { useCellText } from "../../components/SuppressedValue.tsx";
import { FilterBar, FilterNotice } from "../../features/filters/FilterBar.tsx";
import { useAdminFilters, type AdminFiltersApi } from "../../features/filters/useAdminFilters.ts";
import { useMetricsFreshness, useRefreshMetrics } from "../../features/metrics/queries.ts";
import {
  useIndexFormat,
  useMinutesFormat,
  usePercentFormat,
} from "../../features/workload/format.ts";
import { MinutesByActivity } from "../../features/workload/MinutesByActivity.tsx";
import { ProxyPill } from "../../features/workload/ProxyPill.tsx";
import { useWorkloadMetrics, type WorkloadResult } from "../../features/workload/queries.ts";
import { TaskStatusBars } from "../../features/workload/TaskStatusBars.tsx";
import { WeeklyMinutesTrend } from "../../features/workload/WeeklyMinutesTrend.tsx";
import { WorkerTable } from "../../features/workload/WorkerTable.tsx";
import { emitAdminAudit } from "../../lib/audit.ts";
import { makeIdempotencyKey } from "../../lib/idempotency.ts";
import { useDocumentTitle } from "../useDocumentTitle.ts";

export function WorkloadPage() {
  const t = useTx();
  const { language } = useLanguage();
  const persona = useAdminSession((s) => s.persona);
  const grant = useAdminSession((s) => s.grant);
  const session = useAdminSession((s) => s.session);
  const api = useAdminFilters();
  const query = useWorkloadMetrics(api);
  const freshness = useMetricsFreshness(query.data?.lastWriteAt);
  const refresh = useRefreshMetrics();
  useDocumentTitle(t("admin:workload.title"));
  const scope =
    persona === null
      ? ""
      : reportingScopeLabel(persona, grant, session, resolveScopeFromSearch(api.searchString), t);

  return (
    <div className="flex flex-col gap-4" data-testid="workload-page">
      <div>
        <MicroLabel as="p" className="text-primary-dark">
          {t("admin:workload.eyebrow")}
        </MicroLabel>
        <PageHeader
          title={t("admin:workload.title")}
          subtitle={t("admin:workload.subtitle", {
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
        <WorkloadSkeleton />
      ) : query.isError ? (
        <ErrorState
          code={errorCodeOf(query.error) ?? "INTERNAL"}
          message={t("admin:workload.error")}
          onRetry={() => query.refetch()}
        />
      ) : (
        <>
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs">
            <span className="text-muted" data-testid="computed-stamp">
              {t("admin:overview.computed", { time: formatTime(query.data.asOf, language) })}
            </span>
            <span className="text-muted">
              {t("admin:workload.asOf", {
                datetime: formatDateTime(query.data.computedAt, language),
              })}
            </span>
            {freshness.stale ? (
              <Button variant="secondary" size="sm" icon="refresh" onClick={() => void refresh()}>
                {t("admin:overview.stale")}
              </Button>
            ) : null}
          </div>
          <WorkloadBody api={api} data={query.data} />
          <p className="text-muted m-0 text-xs" data-testid="workload-footnote">
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

function WorkloadSkeleton() {
  return (
    <div className="flex flex-col gap-4" data-testid="workload-loading" aria-busy="true">
      <KpiStripSkeleton />
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-12">
        <div className="flex min-h-[320px] flex-col gap-4 lg:col-span-8">
          <LoadingSkeleton variant="table" lines={8} />
        </div>
        <div className="min-h-[320px] lg:col-span-4">
          <LoadingSkeleton variant="card" lines={6} />
        </div>
      </div>
    </div>
  );
}

/** `admin.drilldown.viewed` once per (session, filters) while the worker table is rendered. */
function useWorkerTableAudit(
  rendered: boolean,
  search: string,
  scope: { district: string | null; facility: string | null },
) {
  const services = useServices();
  const { toast } = useToast();
  const t = useTx();
  const session = services.session.getState().session;
  const key =
    session === null || !rendered
      ? null
      : makeIdempotencyKey(["workload-worker-table", session.correlationId, search]);
  useEffect(() => {
    const current = services.session.getState().session;
    if (key === null || current === null || !services.session.once.claim(key)) return;
    emitAdminAudit(services.repo, current, {
      action: "admin.drilldown.viewed",
      entityType: scope.facility !== null ? "facility" : "district",
      entityId: scope.facility ?? scope.district ?? "all",
      ...(scope.facility === null ? {} : { facilityId: scope.facility }),
      ...(scope.district === null ? {} : { districtId: scope.district }),
      changeSummary: { view: "workload_worker_table", search },
    }).catch(() => toast({ title: t("demo:tools.actionFailed"), tone: "danger" }));
  }, [key, services, search, scope.district, scope.facility, toast, t]);
}

function useKpis(data: WorkloadResult): KpiCell[] {
  const t = useTx();
  const minutes = useMinutesFormat();
  const pct = usePercentFormat();
  const index = useIndexFormat();
  const cellText = useCellText({ short: true });
  const { kpis } = data;
  const k = data.threshold;
  const rate = kpis.completionRate;
  const indexText =
    kpis.index.suppressed || kpis.index.value === null
      ? t("admin:workload.kpi.indexNone", { k })
      : t("admin:workload.kpi.index", { index: index(kpis.index.value) });
  return [
    {
      id: "activeWorkers",
      label: t("admin:workload.kpi.activeWorkers"),
      value: kpis.activeWorkers,
      sub: t("admin:workload.kpi.activeWorkersSub"),
    },
    {
      id: "tasksAssigned",
      label: t("admin:workload.kpi.assigned"),
      value: kpis.assigned,
      sub: t("admin:workload.kpi.assignedSub"),
    },
    {
      id: "tasksCompleted",
      label: t("admin:workload.kpi.completed"),
      value: kpis.completed,
      n: kpis.assigned,
      sub:
        rate.suppressed || rate.value === null
          ? t("admin:workload.kpi.completedNone")
          : t("admin:workload.kpi.completedSub", { pct: pct(rate.value) }),
    },
    {
      id: "tasksUnableToReach",
      label: t("admin:workload.kpi.unableToReach"),
      value: kpis.unableToReach,
      sub: t("admin:workload.kpi.unableToReachSub"),
    },
    {
      id: "workloadMinutes",
      label: t("admin:workload.kpi.minutesPerPatientDay"),
      value: kpis.minutesPerPatientDay,
      n: kpis.patientDays,
      derived: true,
      format: minutes,
      sub: (
        <span className="inline-flex flex-wrap items-center gap-1.5" data-testid="kpi-index">
          <ProxyPill />
          <span>{indexText}</span>
          <span className="sr-only">
            {t("admin:workload.kpi.patientDays", { n: cellText(kpis.patientDays, k) })}
          </span>
        </span>
      ),
    },
  ];
}

function WorkloadBody({ api, data }: { api: AdminFiltersApi; data: WorkloadResult }) {
  const t = useTx();
  const { language } = useLanguage();
  // A Kigali calendar day (noon UTC keeps the same date in Kigali).
  const formatDateOnly = (day: string) => formatDate(`${day}T12:00:00.000Z`, language);
  const kpis = useKpis(data);
  const k = data.threshold;
  const scope = { district: api.filters.district, facility: api.filters.facility };
  useWorkerTableAudit(data.workers !== null && !data.noTasks, api.searchString, scope);
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
        label={t("admin:workload.kpi.label")}
        items={kpis}
        threshold={k}
        computedAt={data.asOf}
        rulesetVersions={data.rulesetVersions}
      />
      <p className="text-muted m-0 text-xs" data-testid="baseline-note">
        {t("admin:workload.baseline", {
          from: formatDateOnly(data.baseline.from),
          to: formatDateOnly(data.baseline.to),
        })}
      </p>
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-12">
        <div className="flex min-w-0 flex-col gap-4 lg:col-span-8">
          <Card
            title={t("admin:workload.table.title")}
            meta={info("tasksAssigned", data.kpis.assigned)}
          >
            {data.workers === null ? (
              <div data-testid="no-drilldown">
                <EmptyState
                  icon="lock"
                  title={t("admin:workload.noDrilldown")}
                  description={t("admin:workload.noDrilldownBody")}
                />
              </div>
            ) : data.noTasks ? (
              <div data-testid="no-tasks">
                <EmptyState
                  title={t("admin:workload.empty")}
                  description={t("admin:workload.emptyBody")}
                />
              </div>
            ) : (
              <WorkerTable rows={data.workers} threshold={k} filters={api.filters} />
            )}
          </Card>
          <WeeklyMinutesTrend
            weeks={data.weekly}
            threshold={k}
            aside={info("weeklyMinutesPerPatientDay", data.kpis.patientDays)}
          />
        </div>
        <div className="flex min-w-0 flex-col gap-4 lg:col-span-4">
          <TaskStatusBars
            states={data.taskStates}
            threshold={k}
            info={info("tasksOverdue", data.kpis.assigned)}
          />
          <MinutesByActivity
            minutes={data.minutesByActivity}
            threshold={k}
            info={info("minutesByActivity")}
          />
          <InfoCallout title={t("admin:workload.callout.title")} tone="info">
            <p className="m-0" data-testid="workload-disclaimer">
              {t("admin:workload.disclaimer")} {t("admin:workload.disclaimerPending")}
            </p>
          </InfoCallout>
        </div>
      </div>
    </>
  );
}
