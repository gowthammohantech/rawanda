/**
 * The grouped timeline (CTZ-06): a `SectionList` with one section per Kigali month (newest
 * first), mono rail dates and the vertical rail line, pull-to-refresh, and the screen header
 * (intro, filter chips, "Updated just now") as the list header so everything scrolls together.
 */
import { AppText, MicroLabel, colors, spacing, useTx } from "@laif/ui-native";
import type { ReactElement } from "react";
import { RefreshControl, SectionList, StyleSheet, View } from "react-native";

import type { TimelineItem } from "./buildCitizenTimeline.ts";
import { groupByMonth, monthTitle } from "./timelineDates.ts";
import { TimelineItemRow } from "./TimelineItemRow.tsx";

export type TimelineListProps = {
  items: readonly TimelineItem[];
  header: ReactElement;
  /** Shown under the header when `items` is empty (empty / filter-empty / loading / error). */
  emptyContent?: ReactElement | null;
  refreshing: boolean;
  onRefresh: () => void;
  onPressItem: (item: TimelineItem) => void;
};

export function TimelineList({
  items,
  header,
  emptyContent = null,
  refreshing,
  onRefresh,
  onPressItem,
}: TimelineListProps) {
  const t = useTx();
  const sections = groupByMonth(items).map((s) => ({
    key: s.key,
    title: monthTitle(t, s.firstIso),
    data: s.data,
  }));
  return (
    <SectionList
      testID="timeline-list"
      style={styles.flex}
      contentContainerStyle={styles.content}
      sections={sections}
      keyExtractor={(entry) => entry.id}
      // Short, local lists: render all rows at once (no blank rows while scrolling fast).
      initialNumToRender={200}
      stickySectionHeadersEnabled={false}
      accessibilityLabel={t("citizen:timeline.listLabel")}
      ListHeaderComponent={header}
      ListEmptyComponent={emptyContent ?? undefined}
      renderSectionHeader={({ section }) => (
        <View style={styles.sectionHeader} testID={`timeline-month-${section.key}`}>
          <MicroLabel>{section.title}</MicroLabel>
        </View>
      )}
      renderItem={({ item, index, section }) => (
        <TimelineItemRow
          item={item}
          railBelow={index < section.data.length - 1}
          onPress={item.linkRoute !== null || item.change !== null ? onPressItem : null}
        />
      )}
      refreshControl={
        <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} />
      }
    />
  );
}

/** "Updated just now" under the header (stale state: pull to refresh). */
export function UpdatedJustNow() {
  const t = useTx();
  return (
    <AppText variant="caption" color="subtle" testID="timeline-updated">
      {t("citizen:timeline.updatedJustNow")}
    </AppText>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  content: { padding: spacing.lg, paddingBottom: spacing.xxxl },
  sectionHeader: { paddingTop: spacing.lg, paddingBottom: spacing.sm },
});
