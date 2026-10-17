/**
 * A past reminder (CTZ-05 task 6): `DELIVERED (DEMO)` (with "Got it"), `SEEN` or `CANCELLED`
 * (with a plain reason). "Got it" marks the reminder as seen — it never changes the
 * appointment / next step (a reminder is not attendance).
 */
import type { Reminder } from "@laif/domain";
import { formatDateTime, useLanguage } from "@laif/i18n";
import {
  AppText,
  Button,
  Icon,
  StatusChip,
  colors,
  spacing,
  useTx,
  type Tone,
} from "@laif/ui-native";
import { StyleSheet, View } from "react-native";

import { InlineError } from "../../components/InlineError.tsx";
import { reminderRowStyles } from "./ScheduledReminderRow.tsx";
import { useAcknowledgeReminderAction } from "./useReminders.ts";

type Visual = { chipKey: Parameters<ReturnType<typeof useTx>>[0]; tone: Tone };

const VISUALS: Record<Exclude<Reminder["status"], "scheduled">, Visual> = {
  delivered_simulated: { chipKey: "citizen:reminders.chip.delivered", tone: "warning" },
  acknowledged: { chipKey: "citizen:reminders.chip.seen", tone: "positive" },
  cancelled: { chipKey: "citizen:reminders.chip.cancelled", tone: "neutral" },
};

export function ReminderHistoryRow({ reminder }: { reminder: Reminder }) {
  const t = useTx();
  const { language } = useLanguage();
  const ack = useAcknowledgeReminderAction(reminder);
  if (reminder.status === "scheduled") return null;
  const visual = VISUALS[reminder.status];
  const title = t("citizen:reminders.row.title");
  let line: string;
  if (reminder.status === "acknowledged") {
    line = t("citizen:reminders.row.seenAt", {
      date: formatDateTime(reminder.acknowledgedAt ?? reminder.updatedAt, language),
    });
  } else if (reminder.status === "delivered_simulated") {
    line = t("citizen:reminders.row.deliveredAt", {
      date: formatDateTime(reminder.deliveredAt ?? reminder.scheduledAt, language),
    });
  } else {
    line = t(`citizen:reminders.row.cancelled.${reminder.cancelReason ?? "opted_out"}`);
  }
  const chip = t(visual.chipKey);
  const delivered = reminder.status === "delivered_simulated";
  return (
    <View style={styles.root} testID={`reminder-history-${reminder.id}`}>
      <View
        style={reminderRowStyles.row}
        accessible
        accessibilityLabel={`${title}. ${line}. ${chip}`}
      >
        <View style={[reminderRowStyles.icon, delivered ? null : styles.iconMuted]}>
          <Icon
            name={reminder.status === "acknowledged" ? "check" : "bell"}
            size={16}
            color={delivered ? colors.primaryDark : colors.muted}
          />
        </View>
        <View style={reminderRowStyles.text}>
          <AppText weight="semibold">{title}</AppText>
          <AppText variant="caption" color="muted">
            {line}
          </AppText>
        </View>
        <StatusChip tone={visual.tone}>{chip}</StatusChip>
      </View>
      {delivered ? (
        <View style={styles.actions}>
          <Button
            variant="secondary"
            icon="check"
            loading={ack.status === "pending"}
            disabled={ack.status === "pending"}
            onPress={ack.acknowledge}
            accessibilityHint={t("citizen:reminders.gotItHint")}
            testID={`reminder-got-it-${reminder.id}`}
          >
            {ack.status === "error" ? t("citizen:reminders.retry") : t("citizen:reminders.gotIt")}
          </Button>
          <InlineError
            message={ack.status === "error" ? t("citizen:reminders.gotItError") : null}
          />
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { gap: spacing.xs },
  iconMuted: { backgroundColor: colors.background },
  actions: { gap: spacing.xs, alignItems: "flex-start" },
});
