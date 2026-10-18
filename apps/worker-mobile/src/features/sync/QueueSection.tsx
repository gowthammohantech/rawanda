/** One queue section with its count in the header (HWM-09 task 5); hidden when empty. */
import { spacing, StatusChip, useTx, type Tone } from "@laif/ui-native";
import type { ReactNode } from "react";
import { StyleSheet, View } from "react-native";

import type { SyncSection } from "../../data/syncCenter.ts";

export const SECTION_TITLE_KEYS = {
  decision: "worker:sync.section.decision",
  waiting: "worker:sync.section.waiting",
  notAccepted: "worker:sync.section.notAccepted",
  synced: "worker:sync.section.synced",
} as const satisfies Record<SyncSection, string>;

const SECTION_TONE: Record<SyncSection, Tone> = {
  decision: "danger",
  waiting: "info",
  notAccepted: "warning",
  synced: "positive",
};

export type QueueSectionProps = {
  section: SyncSection;
  count: number;
  children?: ReactNode;
};

export function QueueSection({ section, count, children }: QueueSectionProps) {
  const t = useTx();
  const title = t(SECTION_TITLE_KEYS[section]);
  return (
    <View style={styles.section} testID={`sync-section-${section}`}>
      <View
        style={styles.head}
        accessible
        accessibilityRole="header"
        accessibilityLabel={t("worker:sync.section.count", { label: title, count })}
      >
        <StatusChip
          tone={SECTION_TONE[section]}
          {...(section === "decision" ? { icon: "alert" as const } : {})}
          testID={`sync-section-${section}-title`}
        >
          {title}
        </StatusChip>
        <StatusChip tone="neutral" testID={`sync-section-${section}-count`}>
          {String(count)}
        </StatusChip>
      </View>
      <View style={styles.list} accessibilityRole="list">
        {children}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  section: { gap: spacing.sm },
  head: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
  list: { gap: spacing.sm },
});
