/** Bottom tabs (FND-11 placeholders): My health, Settings. CTZ-02 replaces them with the five tabs. */
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
          title: t("citizen:tabs.health"),
          tabBarAccessibilityLabel: t("citizen:tabs.health"),
          tabBarIcon: tabBarIcon("heart"),
        }}
      />
      <Tabs.Screen
        name="settings"
        options={{
          title: t("citizen:tabs.settings"),
          tabBarAccessibilityLabel: t("citizen:tabs.settings"),
          tabBarIcon: tabBarIcon("settings"),
        }}
      />
    </Tabs>
  );
}
