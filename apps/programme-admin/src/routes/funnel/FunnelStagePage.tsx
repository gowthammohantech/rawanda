/**
 * `/admin/funnel/:stage` (ADM-03 task 5, spec §8 "Funnel drill-down"): breadcrumb Funnel ›
 * Stage, KPI strip (n, % of previous, % of recorded, change vs the previous equal-length
 * period), district → facility breakdown (aggregates only, no patient rows) with the
 * "Assign programme follow-up" action, and the weekly trend per facility.
 *
 * - An unknown `:stage` is a 404; ScopeGuard (ADM-01) checks the query string first and
 *   `RequireCapability` needs `metrics.drilldown` (the auditor gets 403).
 * - Viewing emits `admin.drilldown.viewed` once per (session, stage, search) — sensitive-read
 *   logging (PRD §8).
 */
import { isFunnelStageId, type FunnelStageId } from "@laif/analytics";
import type { ProgrammeActionSourceContext } from "@laif/contracts";
import { formatDate, formatNumber, useLanguage } from "@laif/i18n";
import {
  Card,
  EmptyState,
  ErrorState,
  errorCodeOf,
  LoadingSkeleton,
  PageHeader,
  useToast,
  useTx,
  type TranslationKey,
} from "@laif/ui-web";
import { useEffect, useState } from "react";
import { NavLink, useLocation, useParams } from "react-router";

import { paths } from "../../app/nav.ts";
import { useServices } from "../../app/providers.tsx";
import { ScopeStrip } from "../../app/ScopeStrip.tsx";
import { KpiStrip, KpiStripSkeleton, type KpiCell } from "../../components/KpiStrip.tsx";
import { FilterBar, FilterNotice } from "../../features/filters/FilterBar.tsx";
import { FILTER_PARAMS } from "../../features/filters/filterSchema.ts";
import { useAdminFilters } from "../../features/filters/useAdminFilters.ts";
import { useFunnelStage, type FunnelStageResult } from "../../features/funnel/queries.ts";
import { changeCell, type FunnelScopeSelection } from "../../features/funnel/selectFunnel.ts";
import { STAGE_METRIC, useFunnelHeader } from "../../features/funnel/stageMeta.ts";
import { StageBreakdownTable } from "../../features/funnel/StageBreakdownTable.tsx";
import { WeeklyStageTrend } from "../../features/funnel/WeeklyStageTrend.tsx";
import { useAssignAvailability } from "../../features/programme-actions/mutations.ts";
import {
  ProgrammeActionDialog,
  type ProgrammeActionFormValues,
} from "../../features/programme-actions/ProgrammeActionDialog.tsx";
import { ProgrammeActionsCard } from "../../features/programme-actions/ProgrammeActionsCard.tsx";
import { emitAdminAudit } from "../../lib/audit.ts";
import { findDraft } from "../../lib/drafts.ts";
import { makeIdempotencyKey } from "../../lib/idempotency.ts";
import { NotFoundPage } from "../errors/NotFoundPage.tsx";
import { useDocumentTitle } from "../useDocumentTitle.ts";

export function FunnelStagePage() {
  const { stage } = useParams();
  if (stage === undefined || !isFunnelStageId(stage)) return <NotFoundPage />;
  return <StageDrilldown stage={stage} />;
}

/** `admin.drilldown.viewed` once per (session, stage, search). */
function useDrilldownAudit(
  stage: FunnelStageId,
  search: string,
  scope: { district: string | null; facility: string | null },
) {
  const services = useServices();
  const { toast } = useToast();
  const t = useTx();
  const session = services.session.getState().session;
  const key =
    session === null
      ? null
      : makeIdempotencyKey(["drilldown", session.correlationId, stage, search]);
  useEffect(() => {
    const current = services.session.getState().session;
    if (key === null || current === null || !services.session.once.claim(key)) return;
    emitAdminAudit(services.repo, current, {
      action: "admin.drilldown.viewed",
      entityType: scope.facility !== null ? "facility" : "district",
      entityId: scope.facility ?? scope.district ?? "all",
      ...(scope.facility === null ? {} : { facilityId: scope.facility }),
      ...(scope.district === null ? {} : { districtId: scope.district }),
      changeSummary: { stage, search },
    }).catch(() => toast({ title: t("demo:tools.actionFailed"), tone: "danger" }));
  }, [key, services, stage, search, scope.district, scope.facility, toast, t]);
}

function StageDrilldown({ stage }: { stage: FunnelStageId }) {
  const t = useTx();
  const location = useLocation();
  const api = useAdminFilters();
  const query = useFunnelStage(api, stage);
  const { subtitle } = useFunnelHeader(api);
  const canAssign = useAssignAvailability();
  // ADM-09 (T-09): a draft left by an expired session on this exact URL reopens the dialog.
  const draftContext = `${location.pathname}${location.search}`;
  const [restore, setRestore] = useState(() =>
    findDraft<ProgrammeActionFormValues>("programmeAction", draftContext),
  );
  const [assignFor, setAssignFor] = useState<string | null>(restore?.subject ?? null);
  const [highlight, setHighlight] = useState<string | null>(null);
  const stageLabel = t(`admin:funnel.stage.${stage}` as TranslationKey);
  const scope = { district: api.filters.district, facility: api.filters.facility };
  useDocumentTitle(stageLabel);
  useDrilldownAudit(stage, api.searchString, scope);

  useEffect(() => {
    if (highlight === null) return;
    const timer = setTimeout(() => setHighlight(null), 2000);
    return () => clearTimeout(timer);
  }, [highlight]);

  const filters: Record<string, string> = {};
  const params = new URLSearchParams(location.search);
  for (const name of FILTER_PARAMS) {
    const value = params.get(name);
    if (value) filters[name] = value;
  }
  const sourceContext: ProgrammeActionSourceContext = { page: "funnel_stage", stage, filters };

  return (
    <div className="flex flex-col gap-4" data-testid="funnel-stage-page">
      <PageHeader
        title={stageLabel}
        subtitle={subtitle}
        LinkComponent={NavLink}
        breadcrumbs={[
          { label: t("admin:nav.funnel"), to: `${paths.funnel}${api.searchString}` },
          { label: stageLabel },
        ]}
      />
      <ScopeStrip />
      <FilterNotice api={api} />
      <FilterBar api={api} />
      {query.isPending ? (
        <div className="flex flex-col gap-4" aria-busy="true" data-testid="stage-loading">
          <KpiStripSkeleton />
          <LoadingSkeleton variant="table" lines={5} />
        </div>
      ) : query.isError ? (
        <ErrorState
          code={errorCodeOf(query.error) ?? "INTERNAL"}
          message={t("admin:funnel.error")}
          onRetry={() => query.refetch()}
        />
      ) : (
        <StageBody
          data={query.data}
          stage={stage}
          canAssign={canAssign}
          onAssign={setAssignFor}
          highlight={highlight}
          scope={scope}
        />
      )}
      {assignFor === null ? null : (
        <ProgrammeActionDialog
          facilityId={assignFor}
          sourceContext={sourceContext}
          onClose={() => {
            setAssignFor(null);
            setRestore(null);
          }}
          onAssigned={(action) => setHighlight(action.id)}
          draftContext={draftContext}
          restore={restore !== null && restore.subject === assignFor ? restore : null}
        />
      )}
    </div>
  );
}

function StageBody({
  data,
  stage,
  canAssign,
  onAssign,
  highlight,
  scope,
}: {
  scope: FunnelScopeSelection;
  data: FunnelStageResult;
  stage: FunnelStageId;
  canAssign: ReturnType<typeof useAssignAvailability>;
  onAssign: (facilityId: string) => void;
  highlight: string | null;
}) {
  const t = useTx();
  const { language } = useLanguage();
  const view = data.current;
  const k = view.threshold;
  const current = view.stages.find((s) => s.id === stage);
  const previous = data.previous.stages.find((s) => s.id === stage);
  if (current === undefined || previous === undefined) return null;
  const metric = STAGE_METRIC[stage];
  const pctFormat = (v: number) => `${formatNumber(Math.round(v * 100), language)}%`;
  const change = changeCell(current.n, previous.n);
  const empty = current.n.value === 0;
  const period = {
    from: formatDate(`${data.previousPeriod.from}T12:00:00.000Z`, language),
    to: formatDate(`${data.previousPeriod.to}T12:00:00.000Z`, language),
  };
  const items: KpiCell[] = [
    { id: metric, key: "stage-n", label: t("admin:funnel.kpi.n"), value: current.n },
    ...(stage === "recorded"
      ? []
      : [
          {
            id: metric,
            key: "stage-previous",
            label:
              stage === "referred"
                ? t("admin:funnel.kpi.ofActioned")
                : t("admin:funnel.kpi.ofPrevious"),
            value: current.pctOfPrevious,
            n: current.n,
            derived: true,
            format: pctFormat,
          },
          {
            id: metric,
            key: "stage-recorded",
            label: t("admin:funnel.kpi.ofRecorded"),
            value: current.pctOfRecorded,
            n: current.n,
            derived: true,
            format: pctFormat,
          },
        ]),
    {
      id: metric,
      key: "stage-change",
      label: t("admin:funnel.kpi.change"),
      value: change,
      n: current.n,
      derived: true,
      format: (v) => (v > 0 ? `+${formatNumber(v, language)}` : formatNumber(v, language)),
      sub: t("admin:funnel.kpi.changeSub", {
        ...period,
        previous: previous.n.suppressed
          ? t("admin:privacy.suppressed.short", { k })
          : formatNumber(previous.n.value ?? 0, language),
      }),
    },
  ];

  return (
    <>
      <KpiStrip
        label={t("admin:funnel.kpi.label")}
        items={items}
        threshold={k}
        computedAt={view.asOf}
        rulesetVersions={view.rulesetVersions}
      />
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-12">
        <div className="flex min-w-0 flex-col gap-4 lg:col-span-8">
          <Card title={t("admin:funnel.table.title")} headingLevel={2}>
            <p className="text-muted m-0 mb-3 text-xs">{t("admin:funnel.table.note")}</p>
            {empty ? (
              <EmptyState
                icon="filter"
                title={t("admin:funnel.empty.stage")}
                description={t("admin:funnel.empty.stageHint")}
              />
            ) : (
              <StageBreakdownTable
                view={view}
                stage={stage}
                canAssign={canAssign}
                onAssign={onAssign}
              />
            )}
          </Card>
          {empty ? null : <WeeklyStageTrend view={view} stage={stage} />}
        </div>
        <div className="flex min-w-0 flex-col gap-4 lg:col-span-4">
          <ProgrammeActionsCard scope={scope} highlightId={highlight} />
        </div>
      </div>
    </>
  );
}
