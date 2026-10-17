/**
 * Patient context for the visit (HWM-07 task 6): identifier, age, sex, a link to the patient
 * context (HWM-04), and the latest screening reading WITH units, date and review status. No flag
 * interpretation beyond the clinician-set reason text (the referral reason, when present).
 */
import { effectiveReadings, type Patient, type Screening } from "@laif/domain";
import { domainKey, formatDate, useLanguage } from "@laif/i18n";
import {
  AppText,
  Button,
  Card,
  MicroLabel,
  ReadingDisplay,
  spacing,
  StatusChip,
  useTx,
} from "@laif/ui-native";
import { StyleSheet, View } from "react-native";

import { ageLabel, sexLabel } from "../patients/labels.ts";
import { DetailItem, detailStyles } from "./DetailItem.tsx";

export type PatientContextCardProps = {
  patient: Patient | null;
  latestScreening: Screening | null;
  clinicianReason: string | null;
  now: Date;
  onOpenPatient: (patientId: string) => void;
};

export function PatientContextCard({
  patient,
  latestScreening,
  clinicianReason,
  now,
  onOpenPatient,
}: PatientContextCardProps) {
  const t = useTx();
  const { language } = useLanguage();
  if (patient === null) {
    return (
      <Card title={t("worker:tasks.detail.patient.title")} testID="patient-context-card">
        <AppText color="muted" testID="task-patient-unknown">
          {t("worker:tasks.detail.patient.unknown")}
        </AppText>
      </Card>
    );
  }
  const r = latestScreening === null ? null : effectiveReadings(latestScreening);
  return (
    <Card title={t("worker:tasks.detail.patient.title")} testID="patient-context-card">
      <View style={detailStyles.body}>
        <View style={detailStyles.grid}>
          <DetailItem
            label={t("worker:tasks.detail.patient.identifier")}
            value={patient.syntheticIdentifier}
            testID="task-patient-identifier"
            mono
          />
          <DetailItem
            label={t("worker:tasks.detail.patient.age")}
            value={ageLabel(patient, now, t)}
            testID="task-patient-age"
          />
          <DetailItem
            label={t("worker:tasks.detail.patient.sex")}
            value={sexLabel(patient, t)}
            testID="task-patient-sex"
          />
        </View>
        <View style={styles.reading} testID="task-latest-reading">
          <MicroLabel>{t("worker:tasks.detail.patient.latestReading")}</MicroLabel>
          {latestScreening === null || r === null ? (
            <AppText color="muted" testID="task-no-reading">
              {t("worker:tasks.detail.patient.noReading")}
            </AppText>
          ) : (
            <>
              {r.systolic !== null && r.diastolic !== null ? (
                <ReadingDisplay
                  kind="bloodPressure"
                  systolic={r.systolic}
                  diastolic={r.diastolic}
                />
              ) : null}
              {r.glucoseValue !== null ? (
                <ReadingDisplay
                  kind="glucose"
                  value={r.glucoseValue}
                  unit={r.glucoseUnit}
                  context={r.glucoseContext}
                />
              ) : null}
              <View style={detailStyles.pills}>
                <AppText variant="caption" color="muted" testID="task-reading-date">
                  {t("worker:tasks.detail.patient.measured", {
                    date: formatDate(r.measuredAt, language),
                  })}
                </AppText>
                <StatusChip tone="neutral" testID="task-review-status">
                  {t(domainKey("status.screening", latestScreening.status))}
                </StatusChip>
              </View>
            </>
          )}
          {clinicianReason === null || clinicianReason.trim() === "" ? null : (
            <AppText variant="caption" color="muted" testID="task-clinician-reason">
              {t("worker:tasks.detail.patient.flagReason", { reason: clinicianReason })}
            </AppText>
          )}
        </View>
        <Button
          variant="secondary"
          icon="user"
          testID="task-open-patient"
          accessibilityHint={t("worker:tasks.detail.patient.openHint")}
          onPress={() => onOpenPatient(patient.id)}
        >
          {t("worker:tasks.detail.patient.open")}
        </Button>
      </View>
    </Card>
  );
}

const styles = StyleSheet.create({ reading: { gap: spacing.xs } });
