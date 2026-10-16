import type { ReactNode } from "react";
import { Pressable, StyleSheet, View, type StyleProp, type ViewStyle } from "react-native";

import { a11yState, touchTarget } from "../a11y.ts";
import { Icon } from "../icons/Icon.tsx";
import type { IconName } from "../icons/icon-data.ts";
import { colors, radii, shadows, spacing } from "../tokens.ts";
import { AppText } from "./AppText.tsx";

export type ListRowProps = {
  title: string;
  subtitle?: string;
  /** Third line (mono meta, e.g. "DUE 14 OCT · 08:00"). */
  meta?: string;
  /** Leading icon in a soft tile. */
  icon?: IconName;
  /** Trailing content (StatusChip / SyncStatusPill). */
  trailing?: ReactNode;
  /** Pressable row with a chevron (default when `onPress` is set). */
  onPress?: () => void;
  chevron?: boolean;
  disabled?: boolean;
  /** Defaults to "title, subtitle, meta". */
  accessibilityLabel?: string;
  accessibilityHint?: string;
  style?: StyleProp<ViewStyle>;
  testID?: string;
};

/** Card-style list row (HWM `ListRowCard`): title, subtitle, trailing chip/chevron. */
export function ListRow({
  title,
  subtitle,
  meta,
  icon,
  trailing,
  onPress,
  chevron,
  disabled = false,
  accessibilityLabel,
  accessibilityHint,
  style,
  testID,
}: ListRowProps) {
  const label =
    accessibilityLabel ??
    [title, subtitle, meta].filter((part): part is string => part !== undefined).join(", ");
  const body = (
    <>
      {icon === undefined ? null : (
        <View style={styles.iconTile}>
          <Icon name={icon} size={20} color={colors.primaryDark} />
        </View>
      )}
      <View style={styles.text}>
        <AppText weight="semibold">{title}</AppText>
        {subtitle === undefined ? null : (
          <AppText variant="caption" color="muted">
            {subtitle}
          </AppText>
        )}
        {meta === undefined ? null : (
          <AppText variant="micro" color="muted">
            {meta}
          </AppText>
        )}
      </View>
      {trailing ?? null}
      {(chevron ?? onPress !== undefined) ? (
        <Icon name="chevron" size={18} color={colors.muted} />
      ) : null}
    </>
  );
  if (onPress === undefined) {
    return (
      <View testID={testID} style={[styles.row, style]}>
        {body}
      </View>
    );
  }
  return (
    <Pressable
      testID={testID}
      accessibilityRole="button"
      accessibilityLabel={label}
      {...(accessibilityHint === undefined ? {} : { accessibilityHint })}
      {...a11yState({ disabled })}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [touchTarget, styles.row, pressed ? styles.pressed : null, style]}
    >
      {body}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    minHeight: 56,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    borderWidth: 1,
    borderColor: colors.borderSoft,
    borderRadius: radii.lg,
    backgroundColor: colors.surface,
    ...shadows.card,
  },
  pressed: { backgroundColor: colors.background },
  iconTile: {
    width: 36,
    height: 36,
    borderRadius: radii.sm,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.primarySoft,
  },
  text: { flex: 1, gap: spacing.xxs },
});
