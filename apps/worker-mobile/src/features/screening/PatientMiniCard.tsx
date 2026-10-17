/** Compact patient header on the screening form (HWM-05): name, `DEMO-…` identifier, age · sex. */
import type { Patient } from "@laif/domain";
import { AppText, colors, initialsOf, radii, spacing, useTx } from "@laif/ui-native";
import { StyleSheet, View } from "react-native";

import { ageLabel, sexLabel } from "../patients/labels.ts";

export function PatientMiniCard({ patient, now }: { patient: Patient; now: Date | null }) {
  const t = useTx();
  return (
    <View
      style={styles.card}
      testID="patient-mini-card"
      accessible
      accessibilityLabel={t("worker:screening.patient", {
        name: patient.displayName,
        identifier: patient.syntheticIdentifier,
      })}
    >
      <View style={styles.avatar}>
        <AppText weight="semibold" colorValue={colors.primaryDark}>
          {initialsOf(patient.displayName)}
        </AppText>
      </View>
      <View style={styles.text}>
        <AppText weight="semibold" testID="patient-mini-name">
          {patient.displayName}
        </AppText>
        <AppText variant="caption" mono color="muted">
          {patient.syntheticIdentifier}
        </AppText>
        <AppText variant="caption" color="muted">
          {`${ageLabel(patient, now, t)} · ${sexLabel(patient, t)}`}
        </AppText>
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
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  avatar: {
    width: 44,
    height: 44,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: radii.pill,
    backgroundColor: colors.primarySoft,
  },
  text: { flex: 1, gap: spacing.xxs },
});
