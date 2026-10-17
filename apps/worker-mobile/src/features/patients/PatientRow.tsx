/**
 * Patient row (HWM-04 task 2): initials avatar, name, `DEMO-…` identifier in mono, age (at the
 * demo date) · sex, `MATCH REVIEW` pill when `identityStatus === 'needs_match_review'`, and the
 * derived sync pill when the record is not yet synced. Icon + text, never colour only.
 */
import type { Patient } from "@laif/domain";
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

import { useEntitySyncState } from "../../data/hooks/useEntitySyncState.ts";
import { ageLabel, sexLabel } from "./labels.ts";

export type PatientRowProps = {
  patient: Patient;
  now: Date | null;
  onPress: (patientId: string) => void;
};

export function MatchReviewPill({ testID = "match-review-pill" }: { testID?: string }) {
  const t = useTx();
  return (
    <StatusChip tone="warning" icon="alert" testID={testID}>
      {t("worker:patients.matchReview")}
    </StatusChip>
  );
}

export function PatientRow({ patient, now, onPress }: PatientRowProps) {
  const t = useTx();
  const sync = useEntitySyncState(patient.id);
  const age = ageLabel(patient, now, t);
  const sex = sexLabel(patient, t);
  const flagged = patient.identityStatus === "needs_match_review";
  const label = [
    t("worker:patients.row.label", {
      name: patient.displayName,
      identifier: patient.syntheticIdentifier,
      age,
      sex,
    }),
    flagged ? t("worker:patients.matchReview") : null,
    sync.state === "synced" ? null : t(sync.labelKey),
  ]
    .filter((part) => part !== null)
    .join(", ");
  return (
    <Pressable
      testID={`patient-row-${patient.id}`}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityHint={t("worker:patients.row.hint")}
      onPress={() => onPress(patient.id)}
      style={({ pressed }) => [touchTarget, styles.row, pressed ? styles.pressed : null]}
    >
      <View style={styles.avatar} importantForAccessibility="no-hide-descendants">
        <AppText weight="semibold" colorValue={colors.primaryDark}>
          {initialsOf(patient.displayName)}
        </AppText>
      </View>
      <View style={styles.text}>
        <AppText weight="semibold">{patient.displayName}</AppText>
        <AppText variant="caption" mono color="muted" testID="patient-identifier">
          {patient.syntheticIdentifier}
        </AppText>
        <AppText variant="caption" color="muted">{`${age} · ${sex}`}</AppText>
        {flagged || sync.state !== "synced" ? (
          <View style={styles.pills}>
            {flagged ? <MatchReviewPill /> : null}
            {sync.state === "synced" ? null : <SyncStatusPill state={sync.state} />}
          </View>
        ) : null}
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
