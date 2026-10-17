/** Mono micro-label + value pair used by the task detail cards (one spoken label). */
import { AppText, MicroLabel, spacing } from "@laif/ui-native";
import { StyleSheet, View } from "react-native";

export function DetailItem({
  label,
  value,
  testID,
  mono = false,
}: {
  label: string;
  value: string;
  testID: string;
  mono?: boolean;
}) {
  return (
    <View style={styles.item} accessible accessibilityLabel={`${label}: ${value}`}>
      <MicroLabel>{label}</MicroLabel>
      <AppText weight="semibold" mono={mono} testID={testID}>
        {value}
      </AppText>
    </View>
  );
}

export const detailStyles = StyleSheet.create({
  body: { gap: spacing.md },
  pills: { flexDirection: "row", flexWrap: "wrap", gap: spacing.xs },
  grid: { flexDirection: "row", flexWrap: "wrap", rowGap: spacing.md, columnGap: spacing.lg },
});

const styles = StyleSheet.create({ item: { minWidth: 120, gap: spacing.xxs } });
