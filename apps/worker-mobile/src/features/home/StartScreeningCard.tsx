/** Primary "Start a new screening" card (HWM-03) → the Screen tab. Shown in every state. */
import {
  AppText,
  colors,
  Icon,
  radii,
  shadows,
  spacing,
  touchTarget,
  useTx,
} from "@laif/ui-native";
import { Pressable, StyleSheet, View } from "react-native";

export function StartScreeningCard({ onPress }: { onPress: () => void }) {
  const t = useTx();
  return (
    <Pressable
      testID="start-screening"
      accessibilityRole="button"
      accessibilityLabel={t("worker:home.startScreening")}
      accessibilityHint={t("worker:home.startScreeningHint")}
      onPress={onPress}
      style={({ pressed }) => [touchTarget, styles.card, pressed ? styles.pressed : null]}
    >
      <View style={styles.icon}>
        <Icon name="plus" size={22} color={colors.onPrimary} />
      </View>
      <View style={styles.text}>
        <AppText variant="bodyLarge" weight="semibold" colorValue={colors.onPrimary}>
          {t("worker:home.startScreening")}
        </AppText>
        <AppText variant="caption" colorValue={colors.onPrimary}>
          {t("worker:home.startScreeningHint")}
        </AppText>
      </View>
      <Icon name="chevron" size={20} color={colors.onPrimary} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    padding: spacing.lg,
    borderRadius: radii.lg,
    backgroundColor: colors.primary,
    ...shadows.card,
  },
  pressed: { backgroundColor: colors.primaryDark },
  icon: {
    width: 40,
    height: 40,
    borderRadius: radii.pill,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.primaryDark,
  },
  text: { flex: 1, gap: spacing.xxs },
});
