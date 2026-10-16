/** Bottom tabs (FND-11 placeholders): Home, Settings. HWM-01 replaces them with the five tabs. */
import { bottomTabBarScreenOptions, tabBarIcon, useTx } from "@laif/ui-native";
import { Tabs } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";

export default function TabsLayout() {
  const t = useTx();
  const insets = useSafeAreaInsets();
  return (
    <Tabs screenOptions={bottomTabBarScreenOptions({ bottomInset: insets.bottom })}>
      <Tabs.Screen
        name="index"
        options={{
          title: t("worker:tabs.home"),
          tabBarAccessibilityLabel: t("worker:tabs.home"),
          tabBarIcon: tabBarIcon("home"),
        }}
      />
      <Tabs.Screen
        name="settings"
        options={{
          title: t("worker:tabs.settings"),
          tabBarAccessibilityLabel: t("worker:tabs.settings"),
          tabBarIcon: tabBarIcon("settings"),
        }}
      />
    </Tabs>
  );
}
