/**
 * Prototype reminder card (CTZ-05 task 6): bell icon, "Appointment reminders", the state +
 * timing summary ("We'll remind you the day before." / "Reminders are off") and an accessible
 * switch (`accessibilityRole="switch"`, checked state, ≥ 44 pt row — FND-10 `Toggle`).
 */
import type { ReminderTiming } from "@laif/domain";
import {
  Icon,
  Toggle,
  colors,
  radii,
  shadows,
  spacing,
  useTx,
  type TranslationKey,
} from "@laif/ui-native";
import { StyleSheet, View } from "react-native";

export function reminderSummaryKey(optedIn: boolean, timing: ReminderTiming): TranslationKey {
  if (!optedIn) return "citizen:reminders.toggle.offSummary";
  return timing === "day_before"
    ? "citizen:reminders.toggle.onSummary.dayBefore"
    : "citizen:reminders.toggle.onSummary.morningOf";
}

export type ReminderToggleCardProps = {
  optedIn: boolean;
  timing: ReminderTiming;
  disabled?: boolean;
  onToggle: (next: boolean) => void;
};

export function ReminderToggleCard({
  optedIn,
  timing,
  disabled = false,
  onToggle,
}: ReminderToggleCardProps) {
  const t = useTx();
  const summary = t(reminderSummaryKey(optedIn, timing));
  return (
    <View style={styles.card} testID="reminder-toggle-card">
      <View style={[styles.icon, optedIn ? styles.iconOn : null]}>
        <Icon name="bell" size={20} color={optedIn ? colors.primaryDark : colors.muted} />
      </View>
      <View style={styles.body}>
        <Toggle
          label={t("citizen:reminders.toggle.label")}
          description={summary}
          value={optedIn}
          onValueChange={onToggle}
          disabled={disabled}
          testID="reminder-toggle"
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    padding: spacing.md,
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: colors.borderSoft,
    backgroundColor: colors.surface,
    ...shadows.card,
  },
  icon: {
    width: 40,
    height: 40,
    borderRadius: radii.pill,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.background,
  },
  iconOn: { backgroundColor: colors.primarySoft },
  body: { flex: 1 },
});
