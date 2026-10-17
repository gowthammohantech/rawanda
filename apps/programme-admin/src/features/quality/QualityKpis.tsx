/**
 * Safety & quality KPI strip (ADM-06 task 6, 5 cells): screenings with missing required fields
 * (+ rate), possible identity mismatches (duplicate identifiers + orphan screenings), overturned
 * flags (PROXY rate of reviewed), missed-flag proxy (manual escalations) and duplicate
 * submissions prevented. Every value is an `AggregateCell` from the scope-wide pass.
 */
import { useTx } from "@laif/ui-web";

import { KpiStrip, KpiStripSkeleton, type KpiCell } from "../../components/KpiStrip.tsx";
import { useCellText } from "../../components/SuppressedValue.tsx";
import { usePercentFormat } from "../workload/format.ts";
import { QualityProxyPill } from "./pills.tsx";
import type { QualityResult } from "./queries.ts";

export { KpiStripSkeleton as QualityKpisSkeleton };

export function QualityKpis({ data }: { data: QualityResult }) {
  const t = useTx();
  const pct = usePercentFormat();
  const cellText = useCellText({ short: true });
  const k = data.threshold;
  const { kpis } = data;
  const rateText = (rate: typeof kpis.missingRate, key: "missingSub" | "overturnedSub") =>
    rate.suppressed || rate.value === null
      ? t("admin:quality.kpi.rateNone")
      : t(`admin:quality.kpi.${key}`, { pct: pct(rate.value) });
  const items: KpiCell[] = [
    {
      id: "qualityMissingFields",
      label: t("admin:quality.kpi.missingFields"),
      value: kpis.missing,
      sub: rateText(kpis.missingRate, "missingSub"),
    },
    {
      id: "identityMismatches",
      label: t("admin:quality.kpi.identity"),
      value: kpis.mismatches,
      sub: t("admin:quality.kpi.identitySub", {
        duplicates: cellText(kpis.duplicateIdentifier, k),
        orphans: cellText(kpis.orphanScreening, k),
      }),
    },
    {
      id: "overturnedFlagRate",
      label: t("admin:quality.kpi.overturned"),
      value: kpis.overturned,
      n: kpis.reviewed,
      sub: (
        <span className="inline-flex flex-wrap items-center gap-1.5">
          <QualityProxyPill />
          <span>{rateText(kpis.overturnedRate, "overturnedSub")}</span>
        </span>
      ),
    },
    {
      id: "missedFlagProxy",
      label: t("admin:quality.kpi.missed"),
      value: kpis.missedFlagProxy,
      sub: (
        <span className="inline-flex flex-wrap items-center gap-1.5">
          <QualityProxyPill />
          <span>{t("admin:quality.kpi.missedSub")}</span>
        </span>
      ),
    },
    {
      id: "duplicateSubmissionsPrevented",
      label: t("admin:quality.kpi.duplicates"),
      value: kpis.duplicateSubmissions,
      sub: t("admin:quality.kpi.duplicatesSub"),
    },
  ];
  return (
    <KpiStrip
      label={t("admin:quality.kpi.label")}
      items={items}
      threshold={k}
      computedAt={data.asOf}
      rulesetVersions={data.rulesetVersions}
    />
  );
}
