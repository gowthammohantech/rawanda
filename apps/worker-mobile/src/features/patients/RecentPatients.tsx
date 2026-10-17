/** "Recent" (HWM-04 task 1): the last 10 patients opened or registered on this device. */
import type { Patient } from "@laif/domain";
import { AppText, LoadingState, spacing, useTx } from "@laif/ui-native";
import { StyleSheet, View } from "react-native";

import { PatientRow } from "./PatientRow.tsx";

export type RecentPatientsProps = {
  patients: readonly Patient[] | undefined;
  now: Date | null;
  onOpen: (patientId: string) => void;
};

export function RecentPatients({ patients, now, onOpen }: RecentPatientsProps) {
  const t = useTx();
  if (patients === undefined) {
    return <LoadingState variant="skeleton" rows={2} label={t("worker:patients.searching")} />;
  }
  if (patients.length === 0) {
    return (
      <AppText color="muted" testID="recent-empty">
        {t("worker:patients.recentEmpty")}
      </AppText>
    );
  }
  return (
    <View style={styles.list} testID="recent-patients">
      {patients.map((patient) => (
        <PatientRow key={patient.id} patient={patient} now={now} onPress={onOpen} />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({ list: { gap: spacing.sm } });
