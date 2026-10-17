/** A scheduled reminder (CTZ-05 task 6): date + time (Africa/Kigali), "Appointment reminder", chip. */
import type { Reminder } from "@laif/domain";
import { formatDateTime, useLanguage } from "@laif/i18n";
import { AppText, Icon, StatusChip, colors, radii, spacing, useTx } from "@laif/ui-native";
import { StyleSheet, View } from "react-native";

export function ScheduledReminderRow({ reminder }: { reminder: Reminder }) {
  const t = useTx();
  const { language } = useLanguage();
  const when = t("citizen:reminders.row.scheduledFor", {
    date: formatDateTime(reminder.scheduledAt, language),
  });
  const title = t("citizen:reminders.row.title");
  const chip = t("citizen:reminders.chip.scheduled");
  return (
    <View
      style={styles.row}
      accessible
      accessibilityLabel={`${title}. ${when}. ${chip}`}
      testID={`scheduled-reminder-${reminder.id}`}
    >
      <View style={styles.icon}>
        <Icon name="bell" size={16} color={colors.primaryDark} />
      </View>
      <View style={styles.text}>
        <AppText weight="semibold">{title}</AppText>
        <AppText variant="caption" color="muted">
          {when}
        </AppText>
      </View>
      <StatusChip tone="info" icon="clock">
        {chip}
      </StatusChip>
    </View>
  );
}

export const reminderRowStyles = StyleSheet.create({
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    padding: spacing.md,
    minHeight: 44,
    borderWidth: 1,
    borderColor: colors.borderSoft,
    borderRadius: radii.md,
    backgroundColor: colors.surface,
  },
  icon: {
    width: 32,
    height: 32,
    borderRadius: radii.pill,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.primarySoft,
  },
  text: { flex: 1, gap: spacing.xxs },
});

const styles = reminderRowStyles;
