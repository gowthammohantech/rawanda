/** Translated error under a non-text control (segmented pickers); re-translated at render. */
import { useFieldErrorText, type FieldErrorLike } from "@laif/i18n";
import { AppText, colors, Icon, spacing } from "@laif/ui-native";
import { StyleSheet, View } from "react-native";

export function FieldError({ error }: { error?: FieldErrorLike }) {
  const text = useFieldErrorText(error);
  if (text === undefined) return null;
  return (
    <View
      style={styles.error}
      accessibilityLiveRegion="polite"
      aria-live="polite"
      testID="field-error"
    >
      <Icon name="alert" size={14} color={colors.danger} />
      <AppText variant="caption" weight="medium" colorValue={colors.danger} style={styles.flex}>
        {text}
      </AppText>
    </View>
  );
}

const styles = StyleSheet.create({
  error: { flexDirection: "row", alignItems: "center", gap: spacing.xs },
  flex: { flex: 1 },
});
