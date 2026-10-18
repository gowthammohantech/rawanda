/**
 * Wallet tabs (CTZ-02 task 10): My health, Next steps, Reminders, Timeline, More. Safe-area
 * aware, item min height 56, labels wrap (two lines) instead of truncating at large font
 * scales (CTZ-08: OS dynamic type capped at 3× on tab labels only); each tab has a
 * `tabBarAccessibilityLabel`. The focused tab is remembered (relaunch).
 * CTZ-05: the reminder inbox banner sits above the tabs (and runs the simulated delivery).
 */
import {
  AppText,
  bottomTabBarScreenOptions,
  maxFontSizeMultiplier,
  minTouchTarget,
  tabBarIcon,
  useTx,
} from "@laif/ui-native";
import { Tabs } from "expo-router";
import { StyleSheet, View, type ColorValue } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { ReminderInboxBanner } from "../../../src/features/reminders/ReminderInboxBanner.tsx";
import { useWalletStore } from "../../../src/providers.tsx";
import { TAB_ITEM_MIN_HEIGHT, WALLET_TAB_ITEMS } from "../../../src/navigation/tabs.ts";
import { WALLET_TABS, type WalletTab } from "../../../src/state/session.ts";

function tabLabel(text: string) {
  function TabLabel({ color }: { color: ColorValue; focused?: boolean }) {
    return (
      <AppText
        variant="caption"
        weight="medium"
        align="center"
        numberOfLines={2}
        maxFontSizeMultiplier={maxFontSizeMultiplier.tabLabel}
        {...(typeof color === "string" ? { colorValue: color } : { color: "muted" as const })}
      >
        {text}
      </AppText>
    );
  }
  return TabLabel;
}

export default function TabsLayout() {
  const t = useTx();
  const insets = useSafeAreaInsets();
  const wallet = useWalletStore();
  const base = bottomTabBarScreenOptions({ bottomInset: insets.bottom });
  return (
    <View style={styles.root}>
      <ReminderInboxBanner />
      <Tabs
        screenOptions={{
          ...base,
          tabBarItemStyle: { minHeight: TAB_ITEM_MIN_HEIGHT, minWidth: minTouchTarget },
        }}
        screenListeners={({ route }) => ({
          focus: () => {
            const name = route.name;
            if ((WALLET_TABS as readonly string[]).includes(name)) {
              wallet.getState().setLastTab(name as WalletTab);
            }
          },
        })}
      >
        {WALLET_TAB_ITEMS.map((tab) => {
          const label = t(tab.labelKey);
          return (
            <Tabs.Screen
              key={tab.name}
              name={tab.name}
              options={{
                title: label,
                tabBarLabel: tabLabel(label),
                tabBarAccessibilityLabel: label,
                tabBarIcon: tabBarIcon(tab.icon),
              }}
            />
          );
        })}
      </Tabs>
    </View>
  );
}

const styles = StyleSheet.create({ root: { flex: 1 } });
