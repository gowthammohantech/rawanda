import type { ReactNode } from "react";
import { StyleSheet, View } from "react-native";

import { Icon } from "../icons/Icon.tsx";
import type { IconName } from "../icons/icon-data.ts";
import { colors, radii, spacing, withAlpha } from "../tokens.ts";
import { AppText } from "./AppText.tsx";

export type InfoCalloutProps = {
  title?: string;
  /** Translated body: a string or composed content. */
  children: ReactNode;
  icon?: IconName;
  /** Soft-blue explanation card (default) or a softer teal variant. */
  tone?: "info" | "primary";
  testID?: string;
};

/** Soft-blue "how to read this" explanation card. */
export function InfoCallout({
  title,
  children,
  icon = "info",
  tone = "info",
  testID,
}: InfoCalloutProps) {
  const fg = tone === "info" ? colors.info : colors.primaryDark;
  return (
    <View
      testID={testID}
      accessibilityRole="summary"
      style={[
        styles.box,
        tone === "info"
          ? { backgroundColor: colors.infoSoft, borderColor: withAlpha(colors.info, 0.2) }
          : { backgroundColor: colors.primarySoft, borderColor: withAlpha(colors.primary, 0.2) },
      ]}
    >
      <Icon name={icon} size={18} color={fg} />
      <View style={styles.body}>
        {title === undefined ? null : (
          <AppText variant="body" weight="semibold" colorValue={fg}>
            {title}
          </AppText>
        )}
        {typeof children === "string" ? <AppText variant="body">{children}</AppText> : children}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  box: {
    flexDirection: "row",
    gap: spacing.md,
    borderWidth: 1,
    borderRadius: radii.md,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
  },
  body: { flex: 1, gap: spacing.xs },
});
