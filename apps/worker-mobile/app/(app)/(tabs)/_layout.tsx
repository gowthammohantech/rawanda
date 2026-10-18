/**
 * Five tabs (HWM-01 task 8): Today · Find · Screen · Tasks · Sync. Translated labels and
 * `tabBarAccessibilityLabel`s (re-render on language change), kit icons, ≥ 44 pt targets
 * (`bottomTabBarScreenOptions`). The Sync tab badge shows waiting + needs-decision items
 * (HWM-02 / HWM-09 `useSyncBadge`), with a spoken label.
 */
import { bottomTabBarScreenOptions, tabBarIcon, useTx } from "@laif/ui-native";
import { Tabs } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { useSyncBadge } from "../../../src/data/hooks/usePendingCount.ts";
import { WORKER_TABS } from "../../../src/navigation.ts";

export default function TabsLayout() {
  const t = useTx();
  const insets = useSafeAreaInsets();
  const badge = useSyncBadge();
  const syncLabel = (label: string) =>
    [
      label,
      badge.pending > 0 ? t("worker:sync.badge.pending", { count: badge.pending }) : null,
      badge.decision > 0 ? t("worker:sync.badge.decision", { count: badge.decision }) : null,
    ]
      .filter((part): part is string => part !== null)
      .join(", ");
  return (
    <Tabs screenOptions={bottomTabBarScreenOptions({ bottomInset: insets.bottom })}>
      {WORKER_TABS.map((tab) => (
        <Tabs.Screen
          key={tab.name}
          name={tab.name}
          options={{
            title: t(tab.label),
            tabBarLabel: t(tab.label),
            tabBarAccessibilityLabel:
              tab.name === "sync/index" ? syncLabel(t(tab.label)) : t(tab.label),
            tabBarIcon: tabBarIcon(tab.icon),
            tabBarButtonTestID: `tab-${tab.name.split("/")[0] ?? tab.name}`,
            ...(tab.name === "sync/index" && badge.total > 0 ? { tabBarBadge: badge.total } : {}),
          }}
        />
      ))}
    </Tabs>
  );
}
