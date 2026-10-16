import type { ReactNode } from "react";
import { StyleSheet, View } from "react-native";

import { Icon } from "../icons/Icon.tsx";
import type { IconName } from "../icons/icon-data.ts";
import { colors, radii, spacing } from "../tokens.ts";
import { AppText } from "./AppText.tsx";

/** Shared frame of EmptyState / ErrorState / PermissionDenied (internal). */
export function StatePanel({
  icon,
  iconColor,
  iconBg,
  title,
  message,
  hint,
  actions,
  alert = false,
  dashed = false,
  testID,
}: {
  icon: IconName;
  iconColor: string;
  iconBg: string;
  title: string;
  message: string;
  hint?: string | undefined;
  actions?: ReactNode;
  alert?: boolean;
  dashed?: boolean;
  testID?: string | undefined;
}) {
  return (
    <View
      testID={testID}
      {...(alert
        ? { accessibilityRole: "alert" as const, accessibilityLiveRegion: "polite" as const }
        : {})}
      style={[styles.panel, dashed ? styles.dashed : null]}
    >
      <View style={[styles.iconWrap, { backgroundColor: iconBg }]}>
        <Icon name={icon} size={22} color={iconColor} />
      </View>
      <AppText variant="bodyLarge" weight="bold" heading align="center" accessibilityRole="header">
        {title}
      </AppText>
      <AppText variant="body" color="muted" align="center">
        {message}
      </AppText>
      {hint === undefined ? null : (
        <AppText variant="caption" color="muted" align="center">
          {hint}
        </AppText>
      )}
      {actions === undefined || actions === null ? null : (
        <View style={styles.actions}>{actions}</View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  panel: {
    alignItems: "center",
    justifyContent: "center",
    gap: spacing.sm,
    paddingHorizontal: spacing.xxl,
    paddingVertical: spacing.xxxl,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radii.lg,
    backgroundColor: colors.surface,
  },
  dashed: { borderStyle: "dashed" },
  iconWrap: {
    width: 44,
    height: 44,
    borderRadius: radii.pill,
    alignItems: "center",
    justifyContent: "center",
  },
  actions: {
    marginTop: spacing.sm,
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "center",
    gap: spacing.sm,
  },
});
