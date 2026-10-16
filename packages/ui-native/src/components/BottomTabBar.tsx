import { Icon } from "../icons/Icon.tsx";
import type { IconName } from "../icons/icon-data.ts";
import { colors, fontFamilies, minTouchTarget, spacing } from "../tokens.ts";

/**
 * Styles helper for Expo Router `<Tabs screenOptions={...}>` (navigation structure stays in
 * each app). Labels are passed translated by the app; `tabBarAccessibilityLabel` per screen.
 */
export function bottomTabBarScreenOptions(options: { bottomInset?: number } = {}) {
  const bottom = options.bottomInset ?? 0;
  return {
    headerShown: false,
    tabBarActiveTintColor: colors.primaryDark,
    tabBarInactiveTintColor: colors.muted,
    tabBarAllowFontScaling: true,
    tabBarStyle: {
      backgroundColor: colors.surface,
      borderTopColor: colors.borderSoft,
      borderTopWidth: 1,
      minHeight: minTouchTarget + spacing.xl + bottom,
      paddingTop: spacing.xs,
      paddingBottom: Math.max(bottom, spacing.xs),
    },
    tabBarItemStyle: { minHeight: minTouchTarget, minWidth: minTouchTarget },
    tabBarLabelStyle: { fontFamily: fontFamilies.sansMedium, fontSize: 12 },
    tabBarBadgeStyle: { backgroundColor: colors.danger, color: colors.onPrimary },
  } as const;
}

/** `tabBarIcon` renderer for a kit icon (tinted by the navigator's active/inactive colour). */
export function tabBarIcon(name: IconName) {
  function TabBarIcon({ color, size }: { color: string; size: number; focused?: boolean }) {
    return <Icon name={name} color={color} size={Math.min(size, 26)} />;
  }
  return TabBarIcon;
}

/** Namespace form: `BottomTabBar.screenOptions()`, `BottomTabBar.icon("home")`. */
export const BottomTabBar = { screenOptions: bottomTabBarScreenOptions, icon: tabBarIcon } as const;
