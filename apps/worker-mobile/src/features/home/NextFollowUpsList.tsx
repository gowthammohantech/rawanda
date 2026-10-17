/**
 * Next follow-ups (HWM-03 tasks 3–4): top 5 by `prioritiseFollowUps`. Each row: initials avatar,
 * patient name, task type, due pill with icon + text (`OVERDUE · 1 DAY` danger,
 * `DUE TODAY · 14:00` warning, `UPCOMING · 20 OCT 2026` neutral) and a sync micro-pill when the
 * follow-up has unsynced or conflicting changes ("Needs your decision"). Opens task detail.
 *
 * Built on the kit tokens rather than `ListRow` because `ListRow` has no leading-avatar slot
 * (FND-10 "no additions" for this phase).
 */
import { domainKey, formatDate, formatTime, useLanguage } from "@laif/i18n";
import {
  AppText,
  colors,
  EmptyState,
  Icon,
  initialsOf,
  radii,
  shadows,
  spacing,
  StatusChip,
  SyncStatusPill,
  touchTarget,
  useTx,
  type IconName,
  type Tone,
} from "@laif/ui-native";
import { Pressable, StyleSheet, View } from "react-native";

import type { NextFollowUp } from "./todaySummary.ts";

type DuePill = { tone: Tone; icon: IconName; text: string };

function useDuePill(): (row: NextFollowUp) => DuePill {
  const t = useTx();
  const { language } = useLanguage();
  return (row) => {
    switch (row.bucket) {
      case "overdue":
        return {
          tone: "danger",
          icon: "octagon-alert",
          text: t("worker:home.pill.overdue", { count: Math.max(1, row.daysOverdue) }),
        };
      case "due_today":
        return {
          tone: "warning",
          icon: "clock",
          text: t("worker:home.pill.dueToday", {
            time: formatTime(row.followUp.dueAt, language),
          }),
        };
      case "upcoming":
        return {
          tone: "neutral",
          icon: "calendar",
          text: t("worker:home.pill.upcoming", { date: formatDate(row.followUp.dueAt, language) }),
        };
    }
  };
}

export type NextFollowUpsListProps = {
  rows: readonly NextFollowUp[];
  onOpen: (followUpId: string) => void;
};

export function NextFollowUpsList({ rows, onOpen }: NextFollowUpsListProps) {
  const t = useTx();
  const duePill = useDuePill();
  if (rows.length === 0) {
    return (
      <View testID="home-empty">
        <EmptyState
          icon="clipboard"
          title={t("worker:home.empty")}
          description={t("worker:home.emptyHint")}
        />
      </View>
    );
  }
  return (
    <View style={styles.list} testID="next-follow-ups">
      {rows.map((row) => {
        const pill = duePill(row);
        const name = row.patientName === "" ? t("worker:home.row.unknownPatient") : row.patientName;
        const task = t(domainKey("followUpPurpose", row.followUp.purpose));
        return (
          <Pressable
            key={row.followUp.id}
            testID={`follow-up-row-${row.followUp.id}`}
            accessibilityRole="button"
            accessibilityLabel={t("worker:home.row.label", { name, task, due: pill.text })}
            accessibilityHint={t("worker:home.row.hint")}
            onPress={() => onOpen(row.followUp.id)}
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
                <StatusChip tone={pill.tone} icon={pill.icon} testID="due-pill">
                  {pill.text}
                </StatusChip>
                {row.syncState === "synced" ? null : <SyncStatusPill state={row.syncState} />}
              </View>
            </View>
            <Icon name="chevron" size={18} color={colors.muted} />
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  list: { gap: spacing.sm },
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
