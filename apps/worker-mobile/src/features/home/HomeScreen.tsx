/**
 * Today (HWM-03): greeting + facility, sync status strip, "Start a new screening", today's
 * summary with progress, next prioritised follow-ups and unfinished drafts — all derived from
 * local records for the pinned demo date in Africa/Kigali.
 *
 * States: loading → skeleton cards (summary + list; greeting, strip and Start stay usable);
 * empty → EmptyState and Start screening; offline → the strip says so (all reads are local);
 * DB read failure → ErrorState with Retry. Pull-to-refresh re-queries (`['home']`, `['sync']`)
 * and, when the simulated network is online, runs one sync pass (`repo.sync.process`).
 */
import {
  Button,
  colors,
  ErrorState,
  errorCodeOf,
  LoadingState,
  Screen,
  Section,
  spacing,
  useTx,
} from "@laif/ui-native";
import { useQueryClient } from "@tanstack/react-query";
import { useRouter } from "expo-router";
import { useCallback, useState } from "react";
import { RefreshControl, ScrollView, StyleSheet } from "react-native";

import { AppHeader } from "../../components/AppHeader.tsx";
import { invalidateAfterWrite } from "../../data/queryKeys.ts";
import { useRepository } from "../../providers.tsx";
import { DraftsPreview } from "./DraftsPreview.tsx";
import { Greeting } from "./Greeting.tsx";
import { NextFollowUpsList } from "./NextFollowUpsList.tsx";
import { StartScreeningCard } from "./StartScreeningCard.tsx";
import { SyncStatusStrip } from "./SyncStatusStrip.tsx";
import { useTodaySummary } from "./useTodaySummary.ts";
import { WorklistSummary } from "./WorklistSummary.tsx";

/** HWM-03 task 6: re-query; when online also run one sync pass (pull-to-refresh trigger). */
export function usePullToRefresh(offline: boolean) {
  const repo = useRepository();
  const queryClient = useQueryClient();
  const [refreshing, setRefreshing] = useState(false);
  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      if (!offline) {
        // FND-07 SyncTrigger has no `pull_to_refresh`; a user-initiated pass is `manual`.
        await repo.sync.process({ trigger: "manual" }).catch(() => undefined);
      }
      await invalidateAfterWrite(queryClient);
    } finally {
      setRefreshing(false);
    }
  }, [offline, repo, queryClient]);
  return { refreshing, onRefresh };
}

export function HomeScreen() {
  const t = useTx();
  const router = useRouter();
  const today = useTodaySummary();
  const { refreshing, onRefresh } = usePullToRefresh(today.offline);
  const data = today.data;

  return (
    <Screen
      testID="today-screen"
      edges={["top", "left", "right"]}
      scroll={false}
      header={<AppHeader title={t("worker:nav.today")} />}
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
        <Greeting nowIso={data?.nowIso} />
        <SyncStatusStrip
          offline={today.offline}
          pendingCount={today.pendingCount}
          conflicts={today.conflicts}
          lastSyncedAt={today.lastSyncedAt}
          onOpenSync={() => router.push("/sync")}
        />
        <StartScreeningCard onPress={() => router.push("/screen")} />
        {today.status === "error" ? (
          <ErrorState
            title={t("worker:home.error")}
            {...(errorCodeOf(today.error) === undefined
              ? {}
              : { code: errorCodeOf(today.error) as string })}
            onRetry={() => today.refetch()}
          />
        ) : (
          <>
            <Section title={t("worker:home.section.todaysWork")} testID="section-todays-work">
              {data === undefined ? (
                <LoadingState variant="skeleton" rows={1} label={t("worker:home.loading")} />
              ) : (
                <WorklistSummary
                  overdue={data.overdue}
                  dueToday={data.dueToday}
                  completedToday={data.completedToday}
                  todaysWork={data.todaysWork}
                />
              )}
            </Section>
            <Section
              title={t("worker:home.section.nextFollowUps")}
              testID="section-next-follow-ups"
              action={
                data === undefined || data.openCount === 0 ? undefined : (
                  <Button
                    variant="ghost"
                    size="sm"
                    testID="see-all-tasks"
                    onPress={() => router.push("/tasks")}
                  >
                    {t("worker:home.seeAllTasks")}
                  </Button>
                )
              }
            >
              {data === undefined ? (
                <LoadingState variant="skeleton" rows={3} label={t("worker:home.loading")} />
              ) : (
                <NextFollowUpsList
                  rows={data.next}
                  onOpen={(followUpId) =>
                    router.push({ pathname: "/tasks/[followUpId]", params: { followUpId } })
                  }
                />
              )}
            </Section>
            <Section title={t("worker:home.section.drafts")} testID="section-drafts">
              {data === undefined ? (
                <LoadingState variant="skeleton" rows={1} label={t("worker:home.loading")} />
              ) : (
                <DraftsPreview
                  count={data.draftCount}
                  drafts={data.drafts}
                  onOpen={(draftId) =>
                    router.push({ pathname: "/screenings/draft/[draftId]", params: { draftId } })
                  }
                />
              )}
            </Section>
          </>
        )}
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  content: { padding: spacing.lg, gap: spacing.lg },
});
