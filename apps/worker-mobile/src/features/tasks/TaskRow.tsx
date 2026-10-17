/**
 * One task (HWM-07 task 4): initials avatar, patient name, task type (follow-up purpose), due
 * pill (`OVERDUE · 2 DAYS`, `DUE TODAY · 14:00`, `DUE 18 OCT 2026`, `COMPLETED 12 SEP 2026`),
 * attempt count and a sync pill when the latest local change is pending / in conflict
 * (`NEEDS DECISION`). Text + icon on every pill; ≥ 44 pt; one spoken label.
 */
import { domainKey, useLanguage } from "@laif/i18n";
import {
  AppText,
  colors,
  Icon,
  initialsOf,
  radii,
  shadows,
  spacing,
  StatusChip,
  SyncStatusPill,
  touchTarget,
  useTx,
} from "@laif/ui-native";
import { Pressable, StyleSheet, View } from "react-native";

import type { TaskListRow } from "../../data/followUps.ts";
import { duePill } from "./taskLabels.ts";

export type TaskRowProps = { row: TaskListRow; onOpen: (followUpId: string) => void };

export function TaskRow({ row, onOpen }: TaskRowProps) {
  const t = useTx();
  const { language } = useLanguage();
  const { followUp } = row;
  const pill = duePill(followUp, row.bucket, row.daysOverdue, t, language);
  const name = row.patientName === "" ? t("worker:tasks.row.unknownPatient") : row.patientName;
  const task = t(domainKey("followUpPurpose", followUp.purpose));
  const attempts =
    followUp.attempts.length === 0
      ? t("worker:tasks.noAttempts")
      : t("worker:tasks.attempts", { count: followUp.attempts.length });
  return (
    <Pressable
      testID={`task-row-${followUp.id}`}
      accessibilityRole="button"
      accessibilityLabel={t("worker:tasks.row.label", { name, task, due: pill.text, attempts })}
      accessibilityHint={t("worker:tasks.row.hint")}
      onPress={() => onOpen(followUp.id)}
      style={({ pressed }) => [touchTarget, styles.row, pressed ? styles.pressed : null]}
    >
      <View style={styles.avatar} importantForAccessibility="no-hide-descendants">
        <AppText weight="semibold" colorValue={colors.primaryDark}>
          {initialsOf(name)}
        </AppText>
      </View>
      <View style={styles.text}>
        <AppText weight="semibold">{name}</AppText>
        <AppText variant="caption" color="muted">
          {task}
        </AppText>
        <View style={styles.pills}>
          <StatusChip tone={pill.tone} icon={pill.icon} testID="task-due-pill">
            {pill.text}
          </StatusChip>
          {row.syncState === "conflict" ? (
            <StatusChip tone="danger" icon="alert" testID="task-needs-decision">
              {t("worker:tasks.needsDecision")}
            </StatusChip>
          ) : row.syncState === "synced" ? null : (
            <SyncStatusPill state={row.syncState} testID="task-sync-pill" />
          )}
        </View>
        <AppText variant="caption" color="subtle" testID="task-attempts">
          {attempts}
        </AppText>
      </View>
      <Icon name="chevron" size={18} color={colors.muted} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    borderWidth: 1,
    borderColor: colors.borderSoft,
    borderRadius: radii.lg,
    backgroundColor: colors.surface,
    ...shadows.card,
  },
  pressed: { backgroundColor: colors.background },
  avatar: {
    width: 40,
    height: 40,
    borderRadius: radii.pill,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.primarySoft,
  },
  text: { flex: 1, gap: spacing.xxs },
  pills: { flexDirection: "row", flexWrap: "wrap", gap: spacing.xs, marginTop: spacing.xxs },
});
