import { formatNumber, useLanguage } from "@laif/i18n";
import { Pressable, ScrollView, StyleSheet, View } from "react-native";

import { a11yState, touchTarget } from "../a11y.ts";
import { useTx } from "../i18n.ts";
import { colors, radii, spacing } from "../tokens.ts";
import { AppText } from "./AppText.tsx";

export type TabbedFilterTab<V extends string = string> = {
  value: V;
  /** Translated tab label. */
  label: string;
  /** Count badge (omitted = no badge). */
  count?: number;
};

export type TabbedFilterProps<V extends string = string> = {
  tabs: readonly TabbedFilterTab<V>[];
  value: V;
  onChange: (value: V) => void;
  /** Accessible name of the tab list. */
  label: string;
  testID?: string;
};

/** Horizontal filter tabs with count badges (HWM-07 My tasks: Today / Overdue / Upcoming / Done). */
export function TabbedFilter<V extends string = string>({
  tabs,
  value,
  onChange,
  label,
  testID,
}: TabbedFilterProps<V>) {
  const t = useTx();
  const { language } = useLanguage();
  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      testID={testID ?? "tabbed-filter"}
      contentContainerStyle={styles.row}
    >
      <View accessibilityRole="tablist" accessibilityLabel={label} style={styles.row}>
        {tabs.map((tab) => {
          const active = tab.value === value;
          const name =
            tab.count === undefined
              ? tab.label
              : t("common:a11y.tabCount", { label: tab.label, count: tab.count });
          return (
            <Pressable
              key={tab.value}
              accessibilityRole="tab"
              accessibilityLabel={name}
              {...a11yState({ selected: active })}
              onPress={() => {
                if (!active) onChange(tab.value);
              }}
              style={[touchTarget, styles.tab, active ? styles.tabActive : null]}
            >
              <AppText
                variant="caption"
                weight={active ? "semibold" : "medium"}
                dense
                colorValue={active ? colors.primaryDark : colors.muted}
              >
                {tab.label}
              </AppText>
              {tab.count === undefined ? null : (
                <View style={[styles.badge, active ? styles.badgeActive : null]}>
                  <AppText
                    variant="micro"
                    dense
                    colorValue={active ? colors.onPrimary : colors.muted}
                  >
                    {formatNumber(tab.count, language)}
                  </AppText>
                </View>
              )}
            </Pressable>
          );
        })}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: "row", gap: spacing.xs },
  tab: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: spacing.xs,
    paddingHorizontal: spacing.md,
    borderRadius: radii.pill,
    borderWidth: 1,
    borderColor: colors.borderSoft,
    backgroundColor: colors.surface,
  },
  tabActive: { borderColor: colors.primary, backgroundColor: colors.primarySoft },
  badge: {
    minWidth: 22,
    alignItems: "center",
    paddingHorizontal: spacing.xs,
    borderRadius: radii.pill,
    backgroundColor: colors.background,
  },
  badgeActive: { backgroundColor: colors.primary },
});
