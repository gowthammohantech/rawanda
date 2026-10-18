/**
 * Timeline tab (CTZ-06): what has happened in the care journey and what is still waiting, by
 * month, newest first. Done (care-team confirmed) vs Waiting vs Updated vs Cancelled vs info
 * rows (reminders, "you read your next step" — never Done). Filter chips with counts kept in
 * the wallet store while switching tabs. Tapping a row opens the result / next step / reminders;
 * an Updated row opens the "what changed" sheet. Pull-to-refresh runs the simulated reminder
 * delivery and re-reads, so demo-clock advances show up. `citizen.timeline.viewed` per focus,
 * `citizen.change.viewed` per opened change. Withdrawn consent → ConsentRequiredState.
 */
import {
  AppText,
  Button,
  EmptyState,
  ErrorState,
  LoadingState,
  MicroLabel,
  Screen,
  spacing,
  useTx,
} from "@laif/ui-native";
import { useRouter } from "expo-router";
import { useCallback, useMemo, useState } from "react";
import { StyleSheet, View } from "react-native";

import { ConsentRequiredState } from "../../components/ConsentRequiredState.tsx";
import { WalletHeader } from "../../components/WalletHeader.tsx";
import { RepresentativeBanner } from "../health/RepresentativeBanner.tsx";
import { resultErrorKind, useActivePatient } from "../health/useResults.ts";
import {
  filterCounts,
  matchesFilter,
  type TimelineChange,
  type TimelineItem,
} from "./buildCitizenTimeline.ts";
import { SupportLink } from "../support/SupportLink.tsx";
import { ChangeDetailSheet } from "./ChangeDetailSheet.tsx";
import { TimelineFilterChips } from "./TimelineFilterChips.tsx";
import { TimelineList, UpdatedJustNow } from "./TimelineList.tsx";
import {
  useChangeViewLog,
  useCitizenTimeline,
  useTimelineFilter,
  useTimelineViewLog,
} from "./useTimeline.ts";

export function TimelineScreen() {
  const t = useTx();
  const router = useRouter();
  const patient = useActivePatient();
  const patientId = patient?.patientId ?? null;
  const timeline = useCitizenTimeline(patientId);
  const [filter, setFilter] = useTimelineFilter();
  const [refreshing, setRefreshing] = useState(false);
  const [change, setChange] = useState<TimelineChange | null>(null);
  const logChange = useChangeViewLog(patientId);
  useTimelineViewLog(patientId);

  const all = timeline.items;
  const counts = useMemo(() => filterCounts(all ?? []), [all]);
  const shown = useMemo(() => (all ?? []).filter((i) => matchesFilter(i, filter)), [all, filter]);

  const { refresh: runRefresh } = timeline;
  const refresh = useCallback(async () => {
    setRefreshing(true);
    try {
      await runRefresh();
    } finally {
      setRefreshing(false);
    }
  }, [runRefresh]);

  const onPressItem = useCallback(
    (entry: TimelineItem) => {
      if (entry.change !== null) {
        setChange(entry.change);
        return;
      }
      if (entry.linkRoute !== null) router.push(entry.linkRoute);
    },
    [router],
  );

  const consentError = timeline.error !== null && resultErrorKind(timeline.error) === "consent";
  const loaded = all !== undefined && timeline.error === null;

  let emptyContent = null;
  if (consentError) {
    emptyContent = <ConsentRequiredState />;
  } else if (timeline.error !== null) {
    emptyContent = <ErrorState message={t("citizen:timeline.error")} onRetry={timeline.retry} />;
  } else if (all === undefined) {
    emptyContent = (
      <LoadingState variant="skeleton" rows={4} label={t("citizen:timeline.loading")} />
    );
  } else if (all.length === 0) {
    emptyContent = (
      <EmptyState
        icon="activity"
        title={t("citizen:timeline.empty")}
        description={t("citizen:timeline.subtitle")}
        action={<SupportLink testID="timeline-support" />}
      />
    );
  } else if (shown.length === 0) {
    emptyContent = (
      <EmptyState
        icon="filter"
        title={t("citizen:timeline.filterEmpty")}
        action={
          <Button variant="secondary" onPress={() => setFilter("all")} testID="timeline-show-all">
            {t("citizen:timeline.showAll")}
          </Button>
        }
      />
    );
  }

  const header = (
    <View style={styles.header}>
      <View style={styles.intro}>
        <MicroLabel>{t("citizen:timeline.eyebrow")}</MicroLabel>
        <AppText variant="display" accessibilityRole="header">
          {t("citizen:timeline.title")}
        </AppText>
        <AppText color="muted">{t("citizen:timeline.subtitle")}</AppText>
      </View>
      <RepresentativeBanner patient={patient} />
      {loaded && all.length > 0 ? (
        <>
          <TimelineFilterChips value={filter} counts={counts} onChange={setFilter} />
          <UpdatedJustNow />
        </>
      ) : null}
    </View>
  );

  return (
    <Screen
      testID="timeline-screen"
      edges={["top", "left", "right"]}
      scroll={false}
      header={<WalletHeader title={t("citizen:nav.timeline")} />}
    >
      <TimelineList
        items={loaded ? shown : []}
        header={header}
        emptyContent={emptyContent}
        refreshing={refreshing}
        onRefresh={() => void refresh()}
        onPressItem={onPressItem}
      />
      <ChangeDetailSheet
        change={change}
        onClose={() => setChange(null)}
        onOpened={logChange}
        onOpenResult={(observationId) => {
          setChange(null);
          router.push({ pathname: "/health/[observationId]", params: { observationId } });
        }}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  header: { gap: spacing.md, paddingBottom: spacing.sm },
  intro: { gap: spacing.xs },
});
