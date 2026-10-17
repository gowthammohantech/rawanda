/**
 * Patient header card (HWM-04 task 3): name, micro-labels `IDENTIFIER` / `AGE` / `FACILITY`,
 * sex, optional village / synthetic phone, the identity (`MATCH REVIEW`) and sync pills
 * (`SAVED ON THIS DEVICE` until synced). Unsynced problems link to the Sync center: a rejected
 * registration ("Not accepted", server `VALIDATION_ERROR`) or a conflict.
 */
import type { Patient } from "@laif/domain";
import {
  AppText,
  Button,
  Card,
  InfoCallout,
  MicroLabel,
  spacing,
  SyncStatusPill,
  useTx,
} from "@laif/ui-native";
import { StyleSheet, View } from "react-native";

import { useEntitySyncState } from "../../data/hooks/useEntitySyncState.ts";
import { facilityName } from "../auth/labels.ts";
import { ageLabel, sexLabel } from "./labels.ts";
import { MatchReviewPill } from "./PatientRow.tsx";
import { formatPhoneInput } from "./registerSchema.ts";

export type PatientHeaderCardProps = {
  patient: Patient;
  now: Date | null;
  onOpenSync: () => void;
};

function Item({ label, value, testID }: { label: string; value: string; testID: string }) {
  return (
    <View style={styles.item} accessible accessibilityLabel={`${label}: ${value}`}>
      <MicroLabel>{label}</MicroLabel>
      <AppText weight="semibold" mono={testID === "patient-identifier-value"} testID={testID}>
        {value}
      </AppText>
    </View>
  );
}

export function PatientHeaderCard({ patient, now, onOpenSync }: PatientHeaderCardProps) {
  const t = useTx();
  const sync = useEntitySyncState(patient.id);
  const flagged = patient.identityStatus === "needs_match_review";
  const problem = sync.state === "rejected" || sync.state === "conflict";
  return (
    <Card testID="patient-header-card">
      <View style={styles.body}>
        <AppText variant="title" heading testID="patient-name">
          {patient.displayName}
        </AppText>
        <View style={styles.pills}>
          {flagged ? <MatchReviewPill testID="patient-match-review" /> : null}
          <SyncStatusPill state={sync.state} testID="patient-sync-pill" />
        </View>
        <View style={styles.grid}>
          <Item
            label={t("worker:patients.context.identifier")}
            value={patient.syntheticIdentifier}
            testID="patient-identifier-value"
          />
          <Item
            label={t("worker:patients.context.age")}
            value={ageLabel(patient, now, t)}
            testID="patient-age"
          />
          <Item
            label={t("worker:patients.context.sex")}
            value={sexLabel(patient, t)}
            testID="patient-sex"
          />
          <Item
            label={t("worker:patients.context.facility")}
            value={facilityName(patient.facilityId, t)}
            testID="patient-facility"
          />
          {patient.villageLabel === undefined ? null : (
            <Item
              label={t("worker:patients.context.village")}
              value={patient.villageLabel}
              testID="patient-village"
            />
          )}
          {patient.syntheticPhone === undefined ? null : (
            <Item
              label={t("worker:patients.context.phone")}
              value={formatPhoneInput(patient.syntheticPhone)}
              testID="patient-phone"
            />
          )}
        </View>
        {flagged ? (
          <InfoCallout icon="alert" testID="patient-match-note">
            {t("worker:patients.context.matchReviewNote")}
          </InfoCallout>
        ) : null}
        {problem ? (
          <View style={styles.problem} testID="patient-sync-problem">
            <AppText color="muted">
              {sync.state === "rejected"
                ? t("worker:patients.context.rejectedNote")
                : t("worker:patients.context.conflictNote")}
            </AppText>
            <Button variant="secondary" icon="sync" onPress={onOpenSync} testID="patient-open-sync">
              {t("worker:patients.context.openSync")}
            </Button>
          </View>
        ) : null}
      </View>
    </Card>
  );
}

const styles = StyleSheet.create({
  body: { gap: spacing.md },
  pills: { flexDirection: "row", flexWrap: "wrap", gap: spacing.xs },
  grid: { flexDirection: "row", flexWrap: "wrap", rowGap: spacing.md, columnGap: spacing.lg },
  item: { minWidth: 120, gap: spacing.xxs },
  problem: { gap: spacing.sm },
});
