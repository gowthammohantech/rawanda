import { DEMO_RULE_DISCLAIMER } from "@laif/domain";
import { StyleSheet, View } from "react-native";

import { useTx } from "../i18n.ts";
import { Icon } from "../icons/Icon.tsx";
import { radii, spacing } from "../tokens.ts";
import { AppText } from "./AppText.tsx";
import { TONE_COLORS } from "./tone.ts";

export type RuleDisclaimerProps = { compact?: boolean };

/** `DEMO_RULE_NOT_CLINICALLY_VALIDATED` code + translated explanation. */
export function RuleDisclaimer({ compact = false }: RuleDisclaimerProps) {
  const t = useTx();
  const palette = TONE_COLORS.warning;
  return (
    <View
      testID="rule-disclaimer"
      accessible
      accessibilityRole="text"
      style={[
        styles.box,
        compact ? styles.compact : null,
        { backgroundColor: palette.bg, borderColor: palette.border },
      ]}
    >
      <Icon name="alert" size={16} color={palette.fg} />
      <View style={styles.body}>
        <AppText variant="micro" weight="medium" colorValue={palette.fg}>
          {DEMO_RULE_DISCLAIMER}
        </AppText>
        <AppText variant={compact ? "caption" : "body"} colorValue={palette.fg}>
          {t("demo:ruleDisclaimerExplanation")}
        </AppText>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  box: {
    flexDirection: "row",
    gap: spacing.sm,
    borderWidth: 1,
    borderRadius: radii.md,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
  },
  compact: { paddingHorizontal: spacing.md, paddingVertical: spacing.sm },
  body: { flex: 1, gap: spacing.xxs },
});
