/**
 * Read-only reading summary (HWM-06 task 1): mono micro-labels (`BLOOD PRESSURE`, `GLUCOSE`,
 * `CONTEXT`, `MEASURED AT`), values large with their unit always adjacent (`ReadingDisplay`),
 * measured-at in Africa/Kigali. Used on the review screen (draft values) and the detail screen
 * (effective values = original + amendments).
 */
import type { GlucoseContext, GlucoseUnit } from "@laif/domain";
import { domainKey, formatDateTime, useLanguage } from "@laif/i18n";
import {
  AppText,
  Card,
  colors,
  MicroLabel,
  ReadingDisplay,
  spacing,
  StatusChip,
  useTx,
} from "@laif/ui-native";
import type { ReactNode } from "react";
import { StyleSheet, View } from "react-native";

export type ReadingSummaryValues = {
  systolic: number | null;
  diastolic: number | null;
  glucoseValue: number | null;
  glucoseUnit: GlucoseUnit | null;
  glucoseContext: GlucoseContext | null;
  measuredAt: string;
};

export type ReadingSummaryCardProps = {
  values: ReadingSummaryValues;
  /** Free-text observations (review screen only). */
  notes?: string;
  /** Fields changed by an amendment (marked "Amended"). */
  amendedFields?: readonly string[];
  /** Header action (e.g. "Edit"). */
  action?: ReactNode;
  testID?: string;
};

export function ReadingSummaryCard({
  values,
  notes,
  amendedFields = [],
  action,
  testID = "reading-summary",
}: ReadingSummaryCardProps) {
  const t = useTx();
  const { language } = useLanguage();
  const amended = (...fields: string[]) =>
    fields.some((field) => amendedFields.includes(field)) ? (
      <StatusChip tone="info" testID="amended-field">
        {t("worker:review.detail.amended")}
      </StatusChip>
    ) : null;

  return (
    <Card testID={testID} {...(action === undefined ? {} : { meta: action })}>
      <Row
        label={t("worker:review.label.bloodPressure")}
        testID="summary-bp"
        chip={amended("systolic", "diastolic")}
      >
        {values.systolic !== null && values.diastolic !== null ? (
          <ReadingDisplay
            kind="bloodPressure"
            systolic={values.systolic}
            diastolic={values.diastolic}
            large
          />
        ) : (
          <AppText color="muted">{t("worker:review.notMeasured")}</AppText>
        )}
      </Row>
      <Row
        label={t("worker:review.label.glucose")}
        testID="summary-glucose"
        chip={amended("glucoseValue", "glucoseUnit")}
      >
        {values.glucoseValue !== null ? (
          <ReadingDisplay
            kind="glucose"
            value={values.glucoseValue}
            unit={values.glucoseUnit}
            large
          />
        ) : (
          <AppText color="muted">{t("worker:review.notMeasured")}</AppText>
        )}
      </Row>
      <Row
        label={t("worker:review.label.context")}
        testID="summary-context"
        chip={amended("glucoseContext")}
      >
        <AppText weight="medium">
          {values.glucoseValue === null || values.glucoseContext === null
            ? t("worker:review.notMeasured")
            : t(domainKey("glucoseContext", values.glucoseContext))}
        </AppText>
      </Row>
      <Row
        label={t("worker:review.label.measuredAt")}
        testID="summary-measured-at"
        chip={amended("measuredAt")}
      >
        <AppText weight="medium">
          {t("worker:review.measuredAtValue", {
            time: formatDateTime(values.measuredAt, language),
          })}
        </AppText>
      </Row>
      {notes === undefined ? null : (
        <Row label={t("worker:review.label.observations")} testID="summary-notes">
          <AppText>{notes.trim() === "" ? t("worker:review.none") : notes}</AppText>
        </Row>
      )}
      <Row label={t("worker:review.label.source")} testID="summary-source">
        <AppText variant="caption" color="muted">
          {t("worker:screening.source")}
        </AppText>
      </Row>
    </Card>
  );
}

function Row({
  label,
  children,
  chip,
  testID,
}: {
  label: string;
  children: ReactNode;
  chip?: ReactNode;
  testID: string;
}) {
  return (
    <View style={styles.row} testID={testID}>
      <View style={styles.head}>
        <MicroLabel>{label}</MicroLabel>
        {chip ?? null}
      </View>
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    gap: spacing.xxs,
    paddingVertical: spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: colors.borderSoft,
  },
  head: { flexDirection: "row", alignItems: "center", gap: spacing.sm, flexWrap: "wrap" },
});
