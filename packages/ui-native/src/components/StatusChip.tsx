import type { ReactNode } from "react";
import { StyleSheet, View } from "react-native";

import { useTx } from "../i18n.ts";
import { Icon } from "../icons/Icon.tsx";
import type { IconName } from "../icons/icon-data.ts";
import { useScaledFont, useToneColors } from "../theme.tsx";
import { radii, spacing } from "../tokens.ts";
import { AppText } from "./AppText.tsx";
import { TONE_ICON, type Tone } from "./tone.ts";

export type StatusChipProps = {
  tone?: Tone;
  /** Visible, translated text — required: status is never colour-only. */
  children: ReactNode;
  /** Overrides the tone's default icon. */
  icon?: IconName;
  /** App-level text size multiplier (CTZ-08; default: `DisplayPrefsProvider`). */
  textScale?: number;
  testID?: string;
};

export function isEmptyNode(children: ReactNode): boolean {
  if (children === null || children === undefined || typeof children === "boolean") return true;
  if (typeof children === "string") return children.trim() === "";
  if (Array.isArray(children)) return children.every((child: ReactNode) => isEmptyNode(child));
  return false;
}

/** Pill status badge in mono caps; ALWAYS icon + text (throws on empty text). */
export function StatusChip({
  tone = "neutral",
  children,
  icon,
  textScale,
  testID,
}: StatusChipProps) {
  const t = useTx();
  const tones = useToneColors();
  const font = useScaledFont();
  const iconSize = Math.round(12 * (textScale ?? font.textScale));
  if (isEmptyNode(children)) {
    throw new Error("StatusChip requires visible text: status is never conveyed by colour only.");
  }
  const palette = tones[tone];
  const label =
    typeof children === "string" || typeof children === "number"
      ? t("common:a11y.status", { status: String(children) })
      : undefined;
  return (
    <View
      testID={testID}
      accessible
      accessibilityRole="text"
      {...(label === undefined ? {} : { accessibilityLabel: label })}
      style={[styles.chip, { backgroundColor: palette.bg, borderColor: palette.border }]}
    >
      <Icon name={icon ?? TONE_ICON[tone]} size={iconSize} strokeWidth={2.2} color={palette.fg} />
      <AppText
        variant="micro"
        dense
        colorValue={palette.fg}
        numberOfLines={2}
        {...(textScale === undefined ? {} : { textScale })}
      >
        {children}
      </AppText>
    </View>
  );
}

const styles = StyleSheet.create({
  chip: {
    flexDirection: "row",
    alignItems: "center",
    alignSelf: "flex-start",
    gap: spacing.xs,
    borderWidth: 1,
    borderRadius: radii.pill,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xxs,
    maxWidth: "100%",
  },
});
