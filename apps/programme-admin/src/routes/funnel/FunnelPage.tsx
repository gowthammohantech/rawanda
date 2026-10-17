/**
 * `/admin/funnel` (ADM-03 task 4, PA-03, ref image 2 "Trial funnel"): the five-stage care
 * pathway as share bars (each stage links to its drill-down), the "Dismissed with reason"
 * branch under Reviewed, an Evidence card with stage-to-stage conversions (MetricInfo), a
 * "How to read this" callout and the programme actions in scope. Aggregates only; hidden values
 * show `<k`. Numbers derive from the same dataset as the overview (identical recorded / flagged).
 */
import { METRIC_VERSION, type AggregateCell } from "@laif/analytics";
import { formatNumber, formatTime, useLanguage } from "@laif/i18n";
import {
  Card,
  EmptyState,
  ErrorState,
  errorCodeOf,
  InfoCallout,
  LoadingSkeleton,
  MicroLabel,
  PageHeader,
  useTx,
  type TranslationKey,
} from "@laif/ui-web";

import { ScopeStrip } from "../../app/ScopeStrip.tsx";
import { MetricInfo } from "../../components/MetricInfo.tsx";
import { FilterBar, FilterNotice } from "../../features/filters/FilterBar.tsx";
import { useAdminFilters } from "../../features/filters/useAdminFilters.ts";
import { FunnelBars } from "../../features/funnel/FunnelBars.tsx";
import { useFunnel, type FunnelResult } from "../../features/funnel/queries.ts";
import { STAGE_METRIC, useFunnelHeader } from "../../features/funnel/stageMeta.ts";
import { wholePct } from "../../features/funnel/selectFunnel.ts";
import { ProgrammeActionsCard } from "../../features/programme-actions/ProgrammeActionsCard.tsx";
import { useDocumentTitle } from "../useDocumentTitle.ts";

export function FunnelPage() {
  const t = useTx();
  const { language } = useLanguage();
  const api = useAdminFilters();
  const query = useFunnel(api);
  const { subtitle } = useFunnelHeader(api);
  useDocumentTitle(t("admin:nav.funnel"));
  const scope = { district: api.filters.district, facility: api.filters.facility };

  return (
    <div className="flex flex-col gap-4" data-testid="funnel-page">
      <div>
        <MicroLabel as="p" className="text-primary-dark">
          {t("admin:funnel.eyebrow")}
        </MicroLabel>
        <PageHeader title={t("admin:funnel.title")} subtitle={subtitle} />
      </div>
      <ScopeStrip />
      <FilterNotice api={api} />
      <FilterBar api={api} />
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-12">
        <div className="flex min-w-0 flex-col gap-4 lg:col-span-8">
          {query.isPending ? (
            <FunnelSkeleton />
          ) : query.isError ? (
            <ErrorState
              code={errorCodeOf(query.error) ?? "INTERNAL"}
              message={t("admin:funnel.error")}
              onRetry={() => query.refetch()}
            />
          ) : (
            <Card
              title={t("admin:funnel.bars.title")}
              meta={
                <span className="text-muted text-xs" data-testid="computed-stamp">
                  {t("admin:overview.computed", { time: formatTime(query.data.asOf, language) })}
                </span>
              }
              headingLevel={2}
            >
              {query.data.empty ? (
                <EmptyState
                  icon="calendar"
                  title={t("admin:funnel.empty.title")}
                  description={t("admin:funnel.empty.description")}
                />
              ) : (
                <FunnelBars view={query.data} search={api.searchString} />
              )}
            </Card>
          )}
        </div>
        <div className="flex min-w-0 flex-col gap-4 lg:col-span-4">
          {query.isSuccess && !query.data.empty ? <EvidenceCard data={query.data} /> : null}
          <InfoCallout title={t("admin:funnel.howTo.title")} tone="info">
            <p>{t("admin:funnel.howTo.completion")}</p>
            <p className="mt-1">{t("admin:funnel.howTo.dismissed")}</p>
            <p className="mt-1">{t("admin:funnel.howTo.privacy")}</p>
          </InfoCallout>
          <ProgrammeActionsCard scope={scope} />
        </div>
      </div>
      {query.isSuccess ? (
        <p className="text-muted m-0 text-xs" data-testid="funnel-footnote">
          {t("admin:overview.footnote", {
            n: formatNumber(query.data.excludedConsentWithdrawn, language),
            version: METRIC_VERSION,
          })}
        </p>
      ) : null}
    </div>
  );
}

function FunnelSkeleton() {
  return (
    <div
      className="border-border-soft bg-surface flex min-h-[420px] flex-col gap-5 rounded-lg border p-5"
      data-testid="funnel-loading"
      aria-busy="true"
    >
      {[0, 1, 2, 3, 4].map((i) => (
        <LoadingSkeleton key={i} variant="lines" lines={2} />
      ))}
    </div>
  );
}

function EvidenceCard({ data }: { data: FunnelResult }) {
  const t = useTx();
  const { language } = useLanguage();
  const k = data.threshold;
  const pct = (cell: AggregateCell) => {
    const value = wholePct(cell);
    return value === null ? t("admin:funnel.bars.pctHidden") : `${formatNumber(value, language)}%`;
  };
  const conversions = data.stages.slice(1).map((stage, i) => {
    const previous = data.stages[i];
    return {
      id: stage.id,
      label: t("admin:funnel.evidence.conversion", {
        to: t(`admin:funnel.stage.${stage.id}` as TranslationKey),
        from:
          stage.id === "referred"
            ? t("admin:funnel.evidence.actioned")
            : t(`admin:funnel.stage.${previous?.id ?? "recorded"}` as TranslationKey),
      }),
      value: pct(stage.pctOfPrevious),
      n: stage.n,
    };
  });
  return (
    <Card title={t("admin:funnel.evidence.title")} headingLevel={2}>
      <ul className="m-0 list-none space-y-2 p-0 text-[13px]" data-testid="funnel-evidence">
        {conversions.map((row) => (
          <li key={row.id} className="flex items-baseline justify-between gap-3">
            <span className="text-ink flex items-center gap-1">
              {row.label}
              <MetricInfo
                metric={STAGE_METRIC[row.id]}
                n={row.n}
                threshold={k}
                computedAt={data.asOf}
                rulesetVersions={data.rulesetVersions}
              />
            </span>
            <span className="tabular-nums">{row.value}</span>
          </li>
        ))}
        <li className="border-border-soft flex items-baseline justify-between gap-3 border-t pt-2">
          <span className="text-ink flex items-center gap-1">
            {t("admin:funnel.evidence.dismissed")}
            <MetricInfo
              metric="dismissed"
              n={data.dismissed.n}
              threshold={k}
              computedAt={data.asOf}
              rulesetVersions={data.rulesetVersions}
            />
          </span>
          <span className="tabular-nums">{pct(data.dismissed.pctOfReviewed)}</span>
        </li>
      </ul>
    </Card>
  );
}
