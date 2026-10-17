/**
 * Sticky, safe-area-aware action bar (HWM-07 task 7): "Record contact attempt" and "Record
 * outcome" (≥ 44 pt, routed to the HWM-08 forms). Enabled offline (writes are local-first).
 * A completed task shows "Completed {date}" instead — no actions.
 */
import type { FollowUp } from "@laif/domain";
import { formatDate, useLanguage } from "@laif/i18n";
import { Button, spacing, StatusChip, useTx } from "@laif/ui-native";
import { StyleSheet, View } from "react-native";

export type TaskActionsBarProps = {
  followUp: Pick<FollowUp, "id" | "status" | "completedAt" | "dueAt">;
  onRecordAttempt: () => void;
  onRecordOutcome: () => void;
};

export function TaskActionsBar({
  followUp,
  onRecordAttempt,
  onRecordOutcome,
}: TaskActionsBarProps) {
  const t = useTx();
  const { language } = useLanguage();
  if (followUp.status === "completed") {
    return (
      <View style={styles.bar} testID="task-completed-summary">
        <StatusChip tone="positive" icon="check">
          {t("worker:tasks.completedOn", {
            date: formatDate(followUp.completedAt ?? followUp.dueAt, language),
          })}
        </StatusChip>
      </View>
    );
  }
  return (
    <View style={styles.bar} testID="task-actions">
      <Button
        icon="plus"
        fullWidth
        testID="record-attempt"
        accessibilityHint={t("worker:tasks.recordAttemptHint")}
        onPress={onRecordAttempt}
      >
        {t("worker:tasks.recordAttempt")}
      </Button>
      <Button
        variant="secondary"
        icon="check"
        fullWidth
        testID="record-outcome"
        accessibilityHint={t("worker:tasks.recordOutcomeHint")}
        onPress={onRecordOutcome}
      >
        {t("worker:tasks.recordOutcome")}
      </Button>
    </View>
  );
}

const styles = StyleSheet.create({
  bar: { gap: spacing.sm },
});
