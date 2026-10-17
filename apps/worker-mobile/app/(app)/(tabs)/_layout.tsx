/**
 * Five tabs (HWM-01 task 8): Today · Find · Screen · Tasks · Sync. Translated labels and
 * `tabBarAccessibilityLabel`s (re-render on language change), kit icons, ≥ 44 pt targets
 * (`bottomTabBarScreenOptions`). The Sync badge slot shows the pending count from HWM-02.
 */
import { bottomTabBarScreenOptions, tabBarIcon, useTx } from "@laif/ui-native";
import { Tabs } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { WORKER_TABS } from "../../../src/navigation.ts";

/** HWM-02 wires the sync queue's pending count here. */
const syncBadge: number | undefined = undefined;

export default function TabsLayout() {
  const t = useTx();
  const insets = useSafeAreaInsets();
  return (
    <Tabs screenOptions={bottomTabBarScreenOptions({ bottomInset: insets.bottom })}>
      {WORKER_TABS.map((tab) => (
        <Tabs.Screen
          key={tab.name}
          name={tab.name}
          options={{
            title: t(tab.label),
            tabBarLabel: t(tab.label),
            tabBarAccessibilityLabel: t(tab.label),
            tabBarIcon: tabBarIcon(tab.icon),
            tabBarButtonTestID: `tab-${tab.name.split("/")[0] ?? tab.name}`,
            ...(tab.name === "sync/index" && syncBadge !== undefined
              ? { tabBarBadge: syncBadge }
              : {}),
          }}
        />
      ))}
    </Tabs>
  );
}
