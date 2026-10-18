/**
 * "Flag review outcomes" card (ADM-06 task 6 + LAIF MoH p. 13 "audited for false alarms, missed
 * cases and fairness"): overturned-flag rate and missed-flag proxy (both `PROXY · not clinical
 * accuracy`), flagged / overturned / manual-escalation counts by sex and age band (`PROXY ·
 * fairness signal`) and the structured dismissal-reason distribution (never free text). Every
 * count is an `AggregateCell` of the scope-wide pass (groups sum to their totals).
 */
import {
  AGE_BANDS,
  DISMISSAL_REASON_BUCKETS,
  FLAG_OUTCOME_COLUMNS,
  type AggregateCell,
  type DismissalReasonBucket,
  type FlagOutcomeColumn,
} from "@laif/analytics";
import { SEX_VALUES } from "@laif/domain";
import { Card, useTx, type TranslationKey } from "@laif/ui-web";
import type { ReactNode } from "react";

import { HBarList } from "../../components/charts/HBarList.tsx";
import { SuppressedValue } from "../../components/SuppressedValue.tsx";
import { usePercentFormat } from "../workload/format.ts";
import { QualityProxyPill } from "./pills.tsx";
import type { FairnessCells, QualityKpis } from "./selectQuality.ts";

export function FlagReviewOutcomes({
  kpis,
  fairness,
  reasons,
  threshold,
  info,
}: {
  kpis: QualityKpis;
  fairness: FairnessCells;
  reasons: Record<DismissalReasonBucket, AggregateCell>;
  threshold: number;
  info?: ReactNode;
}) {
  const t = useTx();
  const pct = usePercentFormat();
  const rate = kpis.overturnedRate;
  const groups: Array<{
    id: string;
    label: string;
    cells: Record<FlagOutcomeColumn, AggregateCell>;
  }> = [
    ...SEX_VALUES.map((s) => ({
      id: `sex-${s}`,
      label: t(`admin:quality.fairness.sex.${s}` as TranslationKey),
      cells: fairness.sex[s],
    })),
    ...AGE_BANDS.map((b) => ({
      id: `age-${b}`,
      label: t(`admin:quality.fairness.age.${b}` as TranslationKey),
      cells: fairness.age[b],
    })),
  ];
  return (
    <Card
      title={t("admin:quality.outcomes.title")}
      meta={
        <span className="inline-flex items-center gap-1.5">
          <QualityProxyPill />
          {info}
        </span>
      }
    >
      <div className="flex flex-col gap-4 text-[13px]" data-testid="flag-review-outcomes">
        <dl className="m-0 grid grid-cols-2 gap-3">
          <div>
            <dt className="text-muted text-xs">{t("admin:quality.outcomes.overturnedRate")}</dt>
            <dd className="text-ink m-0 text-lg font-semibold" data-testid="overturned-rate">
              <SuppressedValue cell={rate} threshold={threshold} format={pct} derived />
            </dd>
            <dd className="text-muted m-0 text-xs">
              {t("admin:quality.outcomes.ofReviewed")}{" "}
              <SuppressedValue cell={kpis.overturned} threshold={threshold} compact /> /{" "}
              <SuppressedValue cell={kpis.reviewed} threshold={threshold} compact />
            </dd>
          </div>
          <div>
            <dt className="text-muted text-xs">{t("admin:quality.outcomes.missed")}</dt>
            <dd className="text-ink m-0 text-lg font-semibold" data-testid="missed-proxy">
              <SuppressedValue cell={kpis.missedFlagProxy} threshold={threshold} />
            </dd>
          </div>
        </dl>
        <p className="text-muted m-0 font-mono text-[11px] tracking-wide" data-testid="proxy-label">
          {t("admin:quality.outcomes.proxyLabel")}
        </p>
        <div>
          <h3 className="text-ink m-0 mb-1 text-[13px] font-semibold">
            {t("admin:quality.fairness.title")}
          </h3>
          <p className="text-muted m-0 mb-2 font-mono text-[11px] tracking-wide">
            {t("admin:quality.fairness.label")}
          </p>
          {/* ADM-09: may scroll in RW / narrow cards — a focusable, labelled region (WCAG 2.1.1). */}
          <div
            role="region"
            aria-label={t("admin:quality.fairness.caption")}
            // eslint-disable-next-line jsx-a11y/no-noninteractive-tabindex
            tabIndex={0}
            className="focus-visible:ring-primary relative overflow-x-auto rounded-sm focus-visible:ring-2 focus-visible:outline-none"
          >
            <table className="w-full border-collapse text-xs" data-testid="fairness-table">
              <caption className="sr-only">{t("admin:quality.fairness.caption")}</caption>
              <thead>
                <tr className="text-muted text-start">
                  <th scope="col" className="py-1 pe-2 text-start font-medium">
                    {t("admin:quality.fairness.group")}
                  </th>
                  {FLAG_OUTCOME_COLUMNS.map((c) => (
                    <th key={c} scope="col" className="px-1 py-1 text-end font-medium">
                      {t(`admin:quality.fairness.column.${c}` as TranslationKey)}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {groups.map((g) => (
                  <tr key={g.id} className="border-border-soft border-t">
                    <th scope="row" className="text-ink py-1 pe-2 text-start font-normal">
                      {g.label}
                    </th>
                    {FLAG_OUTCOME_COLUMNS.map((c) => (
                      <td key={c} className="px-1 py-1 text-end">
                        <SuppressedValue cell={g.cells[c]} threshold={threshold} compact />
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
        <div>
          <h3 className="text-ink m-0 mb-2 text-[13px] font-semibold">
            {t("admin:quality.reasons.title")}
          </h3>
          <div data-testid="dismissal-reasons">
            <HBarList
              label={t("admin:quality.reasons.title")}
              threshold={threshold}
              rows={DISMISSAL_REASON_BUCKETS.map((b) => ({
                id: b,
                label: t(`admin:quality.reasons.${b}` as TranslationKey),
                value: reasons[b],
              }))}
            />
          </div>
        </div>
      </div>
    </Card>
  );
}
