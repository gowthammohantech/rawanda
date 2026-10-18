/**
 * "Not for emergencies" (CTZ-08 task 6; clinical + legal review pending): warning tone + alert
 * icon. Deliberately NO phone number, no claim of monitoring and no response time.
 */
import { AppText, Icon, radii, spacing, useToneColors, useTx } from "@laif/ui-native";
import { StyleSheet, View } from "react-native";

export function NotAnEmergencyCard() {
  const t = useTx();
  const tone = useToneColors().warning;
  return (
    <View
      accessible
      accessibilityRole="alert"
      accessibilityLabel={`${t("citizen:support.notEmergencyTitle")}. ${t("citizen:support.notEmergency")}`}
      style={[styles.card, { backgroundColor: tone.bg, borderColor: tone.border }]}
      testID="not-an-emergency"
    >
      <Icon name="alert" size={22} color={tone.fg} />
      <View style={styles.text}>
        <AppText weight="semibold" colorValue={tone.fg}>
          {t("citizen:support.notEmergencyTitle")}
        </AppText>
        <AppText>{t("citizen:support.notEmergency")}</AppText>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: spacing.md,
    borderWidth: 1,
    borderRadius: radii.lg,
    padding: spacing.lg,
  },
  text: { flex: 1, gap: spacing.xxs },
});
