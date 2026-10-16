import { StyleSheet, View } from "react-native";

import { useTx } from "../i18n.ts";
import { Icon } from "../icons/Icon.tsx";
import { colors, spacing } from "../tokens.ts";
import { AppText } from "./AppText.tsx";

/**
 * "DEMONSTRATION — SYNTHETIC PATIENT DATA — NOT FOR CLINICAL USE" (`demo:banner`).
 * Takes no props on purpose: it cannot be hidden, dismissed or reworded. `Screen` always
 * renders it as its first child.
 */
export function DemoBanner() {
  const t = useTx();
  return (
    <View
      testID="demo-banner"
      accessible
      accessibilityRole="text"
      accessibilityLabel={t("demo:banner")}
      style={styles.banner}
    >
      <Icon name="shield" size={14} color={colors.demoBannerFg} />
      <AppText
        variant="micro"
        weight="semibold"
        mono={false}
        colorValue={colors.demoBannerFg}
        align="center"
      >
        {t("demo:banner")}
      </AppText>
    </View>
  );
}

const styles = StyleSheet.create({
  banner: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: spacing.xs,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    backgroundColor: colors.demoBannerBg,
    borderBottomWidth: 1,
    borderBottomColor: colors.demoBannerBorder,
  },
});
