/**
 * Vertical screening timeline (CLN-04 task 1–4): newest first, grouped by Kigali calendar day
 * with mono date labels on a rail (ref image "OCT 2"), one `ScreeningCard` per screening.
 */
import type { Screening } from "@laif/domain";
import { formatDate, useLanguage } from "@laif/i18n";
import { useTx } from "@laif/ui-web";

import { groupByDay, type ScreeningEntry } from "./model.ts";
import { ScreeningCard } from "./ScreeningCard.tsx";

export type ScreeningTimelineProps = {
  entries: readonly ScreeningEntry[];
  nowIso: string;
  canAmend: boolean;
  offline: boolean;
  highlight?: { screeningId: string; amendmentId: string | null } | null;
  onAmended?: (screening: Screening, amendmentId: string | null) => void;
};

export function ScreeningTimeline({
  entries,
  nowIso,
  canAmend,
  offline,
  highlight = null,
  onAmended,
}: ScreeningTimelineProps) {
  const t = useTx();
  const { language } = useLanguage();
  const groups = groupByDay(entries);
  return (
    <ol
      aria-label={t("clinical:timeline.screenings.label")}
      data-testid="screening-timeline"
      className="m-0 list-none space-y-6 p-0"
    >
      {groups.map((group) => (
        <li key={group.day} className="grid gap-3 md:grid-cols-[88px_1fr] md:gap-4">
          <time
            dateTime={group.day}
            className="micro-label text-muted pt-1 font-mono"
            data-testid="screening-day"
          >
            {formatDate(group.dateIso, language)}
          </time>
          <div className="border-border-soft space-y-3 md:border-s md:ps-4">
            {group.entries.map((entry) => (
              <ScreeningCard
                key={entry.screening.id}
                entry={entry}
                nowIso={nowIso}
                canAmend={canAmend}
                offline={offline}
                highlightAmendmentId={
                  highlight?.screeningId === entry.screening.id ? highlight.amendmentId : null
                }
                {...(onAmended === undefined ? {} : { onAmended })}
              />
            ))}
          </div>
        </li>
      ))}
    </ol>
  );
}
