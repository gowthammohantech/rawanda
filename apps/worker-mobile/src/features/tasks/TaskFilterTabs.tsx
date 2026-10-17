/** Due / Overdue / Completed tabs with count badges (HWM-07 task 3), on the FND-10 `TabbedFilter`. */
import { TabbedFilter, useTx } from "@laif/ui-native";

import { TASK_FILTERS, type TaskCounts, type TaskFilter } from "../../data/followUps.ts";

export type TaskFilterTabsProps = {
  value: TaskFilter;
  counts: TaskCounts | undefined;
  onChange: (filter: TaskFilter) => void;
};

export function TaskFilterTabs({ value, counts, onChange }: TaskFilterTabsProps) {
  const t = useTx();
  return (
    <TabbedFilter<TaskFilter>
      testID="task-filter-tabs"
      label={t("worker:tasks.filter.label")}
      value={value}
      onChange={onChange}
      tabs={TASK_FILTERS.map((filter) => ({
        value: filter,
        label: t(`worker:tasks.filter.${filter}`),
        ...(counts === undefined ? {} : { count: counts[filter] }),
      }))}
    />
  );
}
