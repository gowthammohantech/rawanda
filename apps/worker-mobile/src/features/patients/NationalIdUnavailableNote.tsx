/**
 * T-07 graceful failure (HWM-04 task 8): a disabled "Look up national ID" row with the caption
 * "National identity service not connected in this demo". No identity is ever fabricated.
 */
import { AppText, colors, Icon, radii, spacing, touchTarget, useTx } from "@laif/ui-native";
import { StyleSheet, View } from "react-native";

export function NationalIdUnavailableNote() {
  const t = useTx();
  const label = t("worker:patients.nationalIdLookup");
  const caption = t("worker:patients.nationalIdUnavailable");
  return (
    <View
      testID="national-id-lookup"
      accessible
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityHint={caption}
      accessibilityState={{ disabled: true }}
      aria-disabled
      style={[touchTarget, styles.row]}
    >
      <Icon name="lock" size={18} color={colors.muted} />
      <View style={styles.text}>
        <AppText weight="medium" color="muted">
          {label}
        </AppText>
        <AppText variant="caption" color="muted" testID="national-id-caption">
          {caption}
        </AppText>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    padding: spacing.md,
    borderWidth: 1,
    borderStyle: "dashed",
    borderColor: colors.border,
    borderRadius: radii.md,
    backgroundColor: colors.background,
  },
  text: { flex: 1, gap: spacing.xxs },
});
