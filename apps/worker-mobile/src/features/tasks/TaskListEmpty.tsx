/** Per-filter neutral empty copy (HWM-07 UX states) — "No overdue tasks", never "well done". */
import { EmptyState, useTx } from "@laif/ui-native";
import { View } from "react-native";

import type { TaskFilter } from "../../data/followUps.ts";

export function TaskListEmpty({
  filter,
  query,
  onClearSearch,
}: {
  filter: TaskFilter;
  query: string;
  onClearSearch: () => void;
}) {
  const t = useTx();
  const searching = query.trim() !== "";
  return (
    <View testID={`tasks-empty-${filter}`}>
      <EmptyState
        icon={searching ? "search" : "clipboard"}
        title={
          searching
            ? t("worker:tasks.empty.search", { query: query.trim() })
            : t(`worker:tasks.empty.${filter}`)
        }
        {...(searching
          ? { onClearFilters: onClearSearch }
          : { description: t("worker:tasks.empty.hint") })}
      />
    </View>
  );
}
