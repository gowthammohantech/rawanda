/**
 * Correlation trail (CLN-10 task 5, WF-01 step 10): vertical timeline, oldest first, of every
 * event sharing the selected event's correlation id plus the history of the linked review →
 * referral → follow-up entities. Each entry: Kigali time, action pill + label, actor · role.
 */
import type { AuditEvent } from "@laif/domain";
import { formatDate, formatTime, useLanguage } from "@laif/i18n";
import { LoadingSkeleton, StatusChip, Timeline, useTx, type TimelineItem } from "@laif/ui-web";

import { QueryErrorState } from "../../components/QueryErrorState.tsx";
import { actorLine, ActionPill } from "./AuditTable.tsx";
import { useCorrelationTrail } from "./hooks.ts";

export function CorrelationTrail({ event }: { event: AuditEvent }) {
  const t = useTx();
  const { language } = useLanguage();
  const trail = useCorrelationTrail(event);

  if (trail.isPending) {
    return (
      <div role="group" aria-busy="true" aria-label={t("clinical:audit.trail.loading")}>
        <LoadingSkeleton lines={4} />
      </div>
    );
  }
  if (trail.isError) {
    return <QueryErrorState error={trail.error} onRetry={() => void trail.refetch()} />;
  }
  const rows = trail.data;
  if (rows.length <= 1) {
    return <p className="text-muted text-sm">{t("clinical:audit.trail.empty")}</p>;
  }
  const items: TimelineItem[] = rows.map((e) => ({
    id: e.id,
    dateLabel: formatDate(e.occurredAt, language),
    dateTime: e.occurredAt,
    title: <ActionPill event={e} />,
    description: `${formatTime(e.occurredAt, language)} · ${actorLine(e, t)}`,
    ...(e.id === event.id
      ? { chip: <StatusChip tone="info">{t("clinical:audit.trail.current")}</StatusChip> }
      : {}),
  }));
  return (
    <section
      aria-labelledby="audit-trail-title"
      data-testid="correlation-trail"
      className="space-y-3"
    >
      <div>
        <h3 id="audit-trail-title" className="text-ink text-base font-semibold">
          {t("clinical:audit.trail.title")}
        </h3>
        <p className="text-muted text-sm">{t("clinical:audit.trail.description")}</p>
      </div>
      <Timeline items={items} label={t("clinical:audit.trail.title")} />
    </section>
  );
}
