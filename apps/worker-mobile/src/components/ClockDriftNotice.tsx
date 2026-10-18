/**
 * HWM-10 clock-drift warning row (Sync center + Settings): shown while the last sync run found
 * the device clock more than 5 minutes away from the simulated server. Times the worker enters
 * are still saved (ordering uses `localSeq`, never device time).
 */
import { AppText, colors, Icon, radii, spacing, useTx } from "@laif/ui-native";
import { StyleSheet, View } from "react-native";

import { useDeviceClock } from "../demo/useDeviceClock.ts";

export function ClockDriftNotice({ testID = "clock-drift-warning" }: { testID?: string }) {
  const t = useTx();
  const { drift } = useDeviceClock();
  if (drift === null) return null;
  const message = t("worker:settings.clockDrift", { minutes: Math.abs(drift.minutes) });
  return (
    <View
      testID={testID}
      accessible
      accessibilityRole="alert"
      accessibilityLabel={t("worker:a11y.clockWarning", { message })}
      accessibilityLiveRegion="polite"
      style={styles.row}
    >
      <Icon name="clock" size={18} color={colors.warning} />
      <AppText weight="medium" colorValue={colors.warning} style={styles.text}>
        {message}
      </AppText>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: spacing.sm,
    padding: spacing.md,
    borderWidth: 1,
    borderColor: colors.warning,
    borderRadius: radii.md,
    backgroundColor: colors.warningSoft,
  },
  text: { flex: 1 },
});
