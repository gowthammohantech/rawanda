import { useCallback, useRef, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  type GestureResponderEvent,
  type StyleProp,
  type ViewStyle,
} from "react-native";

import { a11yState, touchTarget } from "../a11y.ts";
import { Icon } from "../icons/Icon.tsx";
import type { IconName } from "../icons/icon-data.ts";
import { usePalette, type Palette } from "../theme.tsx";
import { radii, spacing } from "../tokens.ts";
import { AppText } from "./AppText.tsx";

export const BUTTON_VARIANTS = ["primary", "secondary", "ghost", "danger"] as const;
export type ButtonVariant = (typeof BUTTON_VARIANTS)[number];
export type ButtonSize = "sm" | "md";

export type ButtonProps = {
  /** Visible, translated label (also the accessible name unless `accessibilityLabel` is set). */
  children: string;
  variant?: ButtonVariant;
  size?: ButtonSize;
  icon?: IconName;
  iconPosition?: "start" | "end";
  /** Disables the button, sets `busy` and shows a spinner. */
  loading?: boolean;
  disabled?: boolean;
  /**
   * May return a promise: the button then stays busy until it settles, so a second tap
   * (double submit) is ignored.
   */
  onPress?: (event: GestureResponderEvent) => unknown;
  accessibilityLabel?: string;
  accessibilityHint?: string;
  fullWidth?: boolean;
  /** App-level text size multiplier for the label (CTZ-08; default: `DisplayPrefsProvider`). */
  textScale?: number;
  style?: StyleProp<ViewStyle>;
  testID?: string;
};

type VariantColors = { bg: string; fg: string; border: string; pressed: string };

/** Variant colours for a palette (normal or high contrast; CTZ-08). */
function variantColors(colors: Palette): Record<ButtonVariant, VariantColors> {
  return {
    primary: {
      bg: colors.primary,
      fg: colors.onPrimary,
      border: colors.primary,
      pressed: colors.primaryDark,
    },
    secondary: {
      bg: colors.surface,
      fg: colors.ink,
      border: colors.border,
      pressed: colors.background,
    },
    ghost: {
      bg: "transparent",
      fg: colors.primaryDark,
      border: "transparent",
      pressed: colors.primarySoft,
    },
    danger: {
      bg: colors.danger,
      fg: colors.onPrimary,
      border: colors.danger,
      pressed: colors.danger,
    },
  };
}

function isPromiseLike(value: unknown): value is PromiseLike<unknown> {
  return (
    typeof value === "object" &&
    value !== null &&
    typeof (value as { then?: unknown }).then === "function"
  );
}

/** Primary / secondary / ghost / danger action; ≥ 44 pt tall in both sizes. */
export function Button({
  children,
  variant = "primary",
  size = "md",
  icon,
  iconPosition = "start",
  loading = false,
  disabled = false,
  onPress,
  accessibilityLabel,
  accessibilityHint,
  fullWidth = false,
  textScale,
  style,
  testID,
}: ButtonProps) {
  const colors = usePalette();
  const lock = useRef(false);
  const [pending, setPending] = useState(false);
  const busy = loading || pending;
  const inactive = disabled || busy;
  const palette = variantColors(colors)[variant];

  const handlePress = useCallback(
    (event: GestureResponderEvent) => {
      if (inactive || lock.current) return;
      const result = onPress?.(event);
      if (isPromiseLike(result)) {
        lock.current = true;
        setPending(true);
        const release = () => {
          lock.current = false;
          setPending(false);
        };
        result.then(release, release);
      }
    },
    [inactive, onPress],
  );

  const iconNode =
    icon === undefined ? null : (
      <Icon name={icon} size={size === "sm" ? 16 : 18} color={palette.fg} />
    );

  return (
    <Pressable
      testID={testID}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? children}
      {...(accessibilityHint === undefined ? {} : { accessibilityHint })}
      {...a11yState({ disabled: inactive, busy })}
      disabled={inactive}
      onPress={handlePress}
      style={({ pressed }) => [
        touchTarget,
        styles.base,
        size === "sm" ? styles.sm : styles.md,
        {
          backgroundColor: pressed && !inactive ? palette.pressed : palette.bg,
          borderColor: palette.border,
        },
        fullWidth ? styles.fullWidth : null,
        inactive ? styles.inactive : null,
        style,
      ]}
    >
      {busy ? (
        <ActivityIndicator size="small" color={palette.fg} />
      ) : iconPosition === "start" ? (
        iconNode
      ) : null}
      <AppText
        weight="semibold"
        variant={size === "sm" ? "caption" : "body"}
        colorValue={palette.fg}
        align="center"
        {...(textScale === undefined ? {} : { textScale })}
      >
        {children}
      </AppText>
      {!busy && iconPosition === "end" ? iconNode : null}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderRadius: radii.sm,
    gap: spacing.sm,
  },
  sm: { paddingHorizontal: spacing.md, paddingVertical: spacing.xs },
  md: { paddingHorizontal: spacing.lg, paddingVertical: spacing.sm, minHeight: 48 },
  fullWidth: { alignSelf: "stretch" },
  inactive: { opacity: 0.6 },
});
