/** Translated inline field error announced politely (CTZ-02 validation UX state). */
import { AppText, Icon, colors, spacing } from "@laif/ui-native";
import { StyleSheet, View } from "react-native";

export function InlineError({ message, testID }: { message: string | null; testID?: string }) {
  return (
    <View accessibilityLiveRegion="polite" {...(testID === undefined ? {} : { testID })}>
      {message === null ? null : (
        <View style={styles.row} accessibilityRole="alert">
          <Icon name="alert" color={colors.danger} size={16} />
          <AppText variant="caption" color="danger" style={styles.text}>
            {message}
          </AppText>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: "row", alignItems: "center", gap: spacing.xs, marginTop: spacing.xs },
  text: { flexShrink: 1 },
});
