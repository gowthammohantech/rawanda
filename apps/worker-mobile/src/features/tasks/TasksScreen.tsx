/**
 * My tasks (HWM-07): only follow-ups assigned to the signed-in worker in the signed-in facility,
 * split into Due (today + upcoming) / Overdue (derived) / Completed tabs with counts, sorted by
 * due date (completed: newest completion first), with search-within-tasks. The selected tab
 * lives in the route param (`/tasks?filter=overdue`).
 *
 * States: loading → row skeletons; empty → neutral per-filter copy; offline → full read access
 * (OfflineBanner); DB read failure → ErrorState + Retry. Pull-to-refresh behaves as on Today.
 */
import {
  colors,
  ErrorState,
  errorCodeOf,
  InfoCallout,
  LoadingState,
  Screen,
  spacing,
  useTx,
} from "@laif/ui-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useState } from "react";
import { RefreshControl, ScrollView, StyleSheet, View } from "react-native";

import { AppHeader } from "../../components/AppHeader.tsx";
import { parseTaskFilter, type TaskFilter } from "../../data/followUps.ts";
import { useSyncStatus } from "../../data/hooks/useSyncStatus.ts";
import { usePullToRefresh } from "../home/HomeScreen.tsx";
import { useDebouncedValue } from "../patients/usePatients.ts";
import { TaskFilterTabs } from "./TaskFilterTabs.tsx";
import { TaskListEmpty } from "./TaskListEmpty.tsx";
import { TaskRow } from "./TaskRow.tsx";
import { TaskSearchBar } from "./TaskSearchBar.tsx";
import { useTasks } from "./useTasks.ts";

export const TASK_SEARCH_DEBOUNCE_MS = 200;

export function TasksScreen() {
  const t = useTx();
  const router = useRouter();
  const params = useLocalSearchParams<{ filter?: string }>();
  const routeFilter = parseTaskFilter(params.filter);
  const [filter, setFilterState] = useState<TaskFilter>(routeFilter);
  const [seenRouteFilter, setSeenRouteFilter] = useState<TaskFilter>(routeFilter);
  if (seenRouteFilter !== routeFilter) {
    // A deep link / shortcut to `/tasks?filter=…` while the tab is mounted.
    setSeenRouteFilter(routeFilter);
    setFilterState(routeFilter);
  }
  const [search, setSearch] = useState("");
  const query = useDebouncedValue(search.trim(), TASK_SEARCH_DEBOUNCE_MS);
  const tasks = useTasks(filter, query);
  const sync = useSyncStatus();
  const { refreshing, onRefresh } = usePullToRefresh(sync.offline);
  const data = tasks.data;

  const setFilter = (next: TaskFilter) => {
    setFilterState(next);
    router.setParams({ filter: next });
  };

  return (
    <Screen
      testID="tasks-screen"
      edges={["top", "left", "right"]}
      scroll={false}
      offline={sync.offline}
      header={<AppHeader title={t("worker:tasks.title")} />}
    >
      <ScrollView
        style={styles.flex}
        contentContainerStyle={styles.content}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => void onRefresh()}
            tintColor={colors.primary}
            colors={[colors.primary]}
          />
        }
      >
        <TaskFilterTabs value={filter} counts={data?.counts} onChange={setFilter} />
        <TaskSearchBar value={search} onChange={setSearch} />
        {filter === "overdue" ? (
          <InfoCallout icon="info" testID="tasks-overdue-caveat">
            {t("worker:tasks.overdueCaveat")}
          </InfoCallout>
        ) : null}
        {tasks.status === "error" ? (
          <ErrorState
            title={t("worker:tasks.error")}
            {...(errorCodeOf(tasks.error) === undefined
              ? {}
              : { code: errorCodeOf(tasks.error) as string })}
            onRetry={() => tasks.refetch()}
          />
        ) : data === undefined ? (
          <LoadingState variant="skeleton" rows={4} label={t("worker:tasks.loading")} />
        ) : data.items.length === 0 ? (
          <TaskListEmpty filter={filter} query={query} onClearSearch={() => setSearch("")} />
        ) : (
          <View
            style={[styles.list, tasks.switching ? styles.switching : null]}
            testID="task-list"
            accessibilityRole="list"
          >
            {data.items.map((row) => (
              <TaskRow
                key={row.followUp.id}
                row={row}
                onOpen={(followUpId) =>
                  router.push({ pathname: "/tasks/[followUpId]", params: { followUpId } })
                }
              />
            ))}
          </View>
        )}
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  content: { padding: spacing.lg, gap: spacing.md },
  list: { gap: spacing.sm },
  switching: { opacity: 0.6 },
});
