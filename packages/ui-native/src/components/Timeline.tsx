import type { ReactNode } from "react";
import { StyleSheet, View } from "react-native";

import { colors, spacing } from "../tokens.ts";
import { AppText } from "./AppText.tsx";

export type TimelineItem = {
  id: string;
  /** Already-formatted short date for the rail ("14 OCT"). */
  dateLabel: string;
  title: string;
  description?: string;
  /** Trailing chip (e.g. a StatusChip). */
  chip?: ReactNode;
  /** Extra line (actor, time). */
  meta?: string;
};

export type TimelineProps = {
  items: readonly TimelineItem[];
  /** Accessible name (already translated). */
  label: string;
  testID?: string;
};

/** Date-rail activity list for audit and follow-up timelines. */
export function Timeline({ items, label, testID }: TimelineProps) {
  return (
    <View testID={testID ?? "timeline"} accessibilityRole="list" accessibilityLabel={label}>
      {items.map((item, index) => (
        <View
          key={item.id}
          accessibilityRole="text"
          style={[styles.item, index > 0 ? styles.separator : null]}
        >
          <View style={styles.rail}>
            <AppText variant="micro" color="muted" dense>
              {item.dateLabel}
            </AppText>
          </View>
          <View style={styles.body}>
            <View style={styles.head}>
              <AppText weight="semibold" style={styles.title}>
                {item.title}
              </AppText>
              {item.chip ?? null}
            </View>
            {item.description === undefined ? null : (
              <AppText variant="caption" color="muted">
                {item.description}
              </AppText>
            )}
            {item.meta === undefined ? null : (
              <AppText variant="caption" color="subtle">
                {item.meta}
              </AppText>
            )}
          </View>
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  item: { flexDirection: "row", gap: spacing.md, paddingVertical: spacing.md },
  separator: { borderTopWidth: 1, borderTopColor: colors.borderSoft },
  rail: { width: 64, paddingTop: spacing.xxs },
  body: { flex: 1, gap: spacing.xxs },
  head: { flexDirection: "row", flexWrap: "wrap", alignItems: "flex-start", gap: spacing.sm },
  title: { flex: 1 },
});
