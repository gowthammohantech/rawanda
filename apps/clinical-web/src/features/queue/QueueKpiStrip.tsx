/**
 * KPI strip (CLN-05 task 4): one white card split by vertical dividers (ref image 1/5) via
 * `KpiStrip` / `MetricCard` — Awaiting review · Urgent (demo protocol) · Overdue (derived) ·
 * Assigned to me · Reviewed this week. Values come from the unfiltered facility `countReviews`
 * (the same cache entry as the sidebar badge) and `listReviews({ decidedSince })`. Every tile
 * has a text label and hint (urgency is never colour-only). Loading → skeleton; a failed refresh
 * keeps the last values with a "stale" label.
 */
import { formatTime, useLanguage } from "@laif/i18n";
import type { ReviewCounts } from "@laif/repositories";
import { Icon, KpiStrip, LoadingSkeleton, useTx, type KpiItem } from "@laif/ui-web";
import { KPI_STRIP_CLASS } from "../../components/responsive.ts";

export type QueueKpiStripProps = {
  counts: ReviewCounts | undefined;
  reviewedThisWeek: number | undefined;
  /** Set when the last refresh failed but earlier values are shown. */
  staleSince: number | null;
};

export function QueueKpiStrip({ counts, reviewedThisWeek, staleSince }: QueueKpiStripProps) {
  const t = useTx();
  const { language } = useLanguage();
  if (counts === undefined) {
    return (
      <div
        role="group"
        aria-busy="true"
        aria-label={t("clinical:queue.kpi.label")}
        data-testid="queue-kpis"
      >
        <LoadingSkeleton variant="kpi" />
      </div>
    );
  }
  const items: KpiItem[] = [
    {
      id: "awaiting",
      label: t("clinical:queue.kpi.awaiting"),
      value: counts.pending,
      hint: t("clinical:queue.kpi.awaitingHint"),
    },
    {
      id: "urgent",
      label: (
        <span className="inline-flex items-center gap-1.5">
          <Icon name="dot" size={12} className="text-risk-danger" />
          {t("clinical:queue.kpi.urgent")}
        </span>
      ),
      value: counts.urgent,
      hint: t("clinical:queue.kpi.urgentHint"),
      tone: counts.urgent > 0 ? "danger" : "neutral",
    },
    {
      id: "overdue",
      label: (
        <span className="inline-flex items-center gap-1.5">
          <Icon name="clock" size={12} className="text-risk-warning" />
          {t("clinical:queue.kpi.overdue")}
        </span>
      ),
      value: counts.overdue,
      hint: t("clinical:queue.kpi.overdueHint"),
      tone: counts.overdue > 0 ? "warning" : "neutral",
    },
    {
      id: "assigned",
      label: t("clinical:queue.kpi.assignedToMe"),
      value: counts.assigned,
      hint: t("clinical:queue.kpi.assignedToMeHint"),
    },
    {
      id: "reviewedThisWeek",
      label: t("clinical:queue.kpi.reviewedThisWeek"),
      value: reviewedThisWeek ?? t("clinical:queue.tabs.countLoading"),
      hint: t("clinical:queue.kpi.reviewedThisWeekHint"),
    },
  ];
  return (
    <div data-testid="queue-kpis" className="space-y-1">
      <KpiStrip className={KPI_STRIP_CLASS} items={items} label={t("clinical:queue.kpi.label")} />
      {staleSince === null ? null : (
        <p role="status" data-testid="queue-kpis-stale" className="text-risk-warning text-xs">
          {t("clinical:queue.kpi.stale", {
            time: formatTime(new Date(staleSince).toISOString(), language),
          })}
        </p>
      )}
    </div>
  );
}
