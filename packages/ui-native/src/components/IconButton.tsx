import type { ReactNode } from "react";
import { Pressable, StyleSheet, View, type StyleProp, type ViewStyle } from "react-native";

import { a11yState, compactHitSlop, touchTarget } from "../a11y.ts";
import { useTx, type TranslationKey, type TranslationValues } from "../i18n.ts";
import { Icon } from "../icons/Icon.tsx";
import type { IconName } from "../icons/icon-data.ts";
import { colors, radii } from "../tokens.ts";

type LabelProps =
  | { labelKey: TranslationKey; labelValues?: TranslationValues; label?: never }
  | { label: string; labelKey?: never; labelValues?: never };

export type IconButtonProps = LabelProps & {
  icon: IconName;
  onPress?: () => void;
  variant?: "ghost" | "outline";
  disabled?: boolean;
  /** Small status dot (e.g. pending items); announced via `badgeLabel`. */
  badge?: boolean;
  /** Translated text appended to the label when `badge` is set. */
  badgeLabel?: string;
  accessibilityHint?: string;
  /** Extra content (e.g. a count). */
  adornment?: ReactNode;
  style?: StyleProp<ViewStyle>;
  testID?: string;
};

/** Icon-only control; the accessible label is REQUIRED (translation key or translated text). */
export function IconButton(props: IconButtonProps) {
  const t = useTx();
  const {
    icon,
    onPress,
    variant = "ghost",
    disabled = false,
    badge = false,
    badgeLabel,
    accessibilityHint,
    adornment,
    style,
    testID,
  } = props;
  const label = props.labelKey === undefined ? props.label : t(props.labelKey, props.labelValues);
  const fullLabel = badge && badgeLabel !== undefined ? `${label}. ${badgeLabel}` : label;
  return (
    <Pressable
      testID={testID}
      accessibilityRole="button"
      accessibilityLabel={fullLabel}
      {...(accessibilityHint === undefined ? {} : { accessibilityHint })}
      {...a11yState({ disabled })}
      disabled={disabled}
      hitSlop={compactHitSlop}
      onPress={onPress}
      style={({ pressed }) => [
        touchTarget,
        styles.base,
        variant === "outline" ? styles.outline : null,
        pressed ? styles.pressed : null,
        disabled ? styles.disabled : null,
        style,
      ]}
    >
      <Icon name={icon} size={22} color={colors.ink} />
      {badge ? <View testID="icon-button-badge" style={styles.badge} /> : null}
      {adornment}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: {
    alignItems: "center",
    justifyContent: "center",
    borderRadius: radii.pill,
  },
  outline: { borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface },
  pressed: { backgroundColor: colors.background },
  disabled: { opacity: 0.6 },
  badge: {
    position: "absolute",
    top: 8,
    right: 8,
    width: 8,
    height: 8,
    borderRadius: radii.pill,
    backgroundColor: colors.danger,
    borderWidth: 2,
    borderColor: colors.surface,
  },
});
