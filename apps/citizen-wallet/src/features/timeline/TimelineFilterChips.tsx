/** `All` / `Waiting` / `Done` / `Changes` with counts (CTZ-06 task 4; kit `TabbedFilter`). */
import { TabbedFilter, useTx, type TranslationKey } from "@laif/ui-native";

import { TIMELINE_FILTERS, type TimelineFilter } from "./buildCitizenTimeline.ts";

const LABELS: Record<TimelineFilter, TranslationKey> = {
  all: "citizen:timeline.filter.all",
  waiting: "citizen:timeline.filter.waiting",
  done: "citizen:timeline.filter.done",
  changes: "citizen:timeline.filter.changes",
};

export function TimelineFilterChips({
  value,
  counts,
  onChange,
}: {
  value: TimelineFilter;
  counts: Record<TimelineFilter, number>;
  onChange: (value: TimelineFilter) => void;
}) {
  const t = useTx();
  return (
    <TabbedFilter
      testID="timeline-filters"
      label={t("citizen:timeline.filter.label")}
      value={value}
      onChange={onChange}
      tabs={TIMELINE_FILTERS.map((f) => ({ value: f, label: t(LABELS[f]), count: counts[f] }))}
    />
  );
}
