import type { ReactNode } from "react";
import { StyleSheet, View, type StyleProp, type ViewStyle } from "react-native";

import { colors, radii, shadows, spacing } from "../tokens.ts";
import { AppText } from "./AppText.tsx";
import { MicroLabel } from "./MicroLabel.tsx";

export type CardProps = {
  title?: ReactNode;
  /** Mono uppercase label above the title. */
  eyebrow?: ReactNode;
  /** Right side of the header (meta text, a chip or a small button). */
  meta?: ReactNode;
  children?: ReactNode;
  /** `muted` = grey inner panel; `flat` removes padding. */
  variant?: "default" | "muted" | "flat";
  style?: StyleProp<ViewStyle>;
  testID?: string;
};

/** White card with 16 pt radius and a hairline border. */
export function Card({
  title,
  eyebrow,
  meta,
  children,
  variant = "default",
  style,
  testID,
}: CardProps) {
  const hasHeader = title !== undefined || eyebrow !== undefined || meta !== undefined;
  return (
    <View
      testID={testID}
      style={[
        styles.card,
        variant === "muted" ? styles.muted : styles.surface,
        variant === "flat" ? styles.flat : null,
        style,
      ]}
    >
      {hasHeader ? (
        <View style={styles.header}>
          <View style={styles.headerText}>
            {eyebrow === undefined ? null : <MicroLabel>{eyebrow}</MicroLabel>}
            {title === undefined ? null : (
              <AppText variant="bodyLarge" weight="semibold" accessibilityRole="header">
                {title}
              </AppText>
            )}
          </View>
          {meta === undefined ? null : typeof meta === "string" ? (
            <AppText variant="caption" color="muted">
              {meta}
            </AppText>
          ) : (
            meta
          )}
        </View>
      ) : null}
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    borderWidth: 1,
    borderColor: colors.borderSoft,
    borderRadius: radii.lg,
    padding: spacing.lg,
    gap: spacing.md,
  },
  surface: { backgroundColor: colors.surface, ...shadows.card },
  muted: { backgroundColor: colors.background },
  flat: { padding: 0 },
  header: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: spacing.sm,
  },
  headerText: { flex: 1, gap: spacing.xxs },
});
