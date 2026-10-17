/**
 * Corrections of a submitted screening (HWM-06 task 7): field, before → after (with units),
 * reason, author and time (Africa/Kigali). Read-only — the original record is never edited.
 */
import type {
  AmendableValue,
  GlucoseContext,
  GlucoseUnit,
  Screening,
  ScreeningAmendment,
} from "@laif/domain";
import { domainKey, formatDateTime, formatMeasurement, useLanguage } from "@laif/i18n";
import { DEMO_PERSONAS } from "@laif/mock-data";
import { AppText, colors, radii, spacing, useTx } from "@laif/ui-native";
import { StyleSheet, View } from "react-native";

type Tx = ReturnType<typeof useTx>;

/** One amendable value as text, with its unit (glucose uses the unit in effect at the time). */
export function formatAmendValue(
  field: ScreeningAmendment["field"],
  value: AmendableValue,
  t: Tx,
  language: Parameters<typeof formatMeasurement>[2],
  glucoseUnit: GlucoseUnit | null,
): string {
  if (value === null || value === "") return t("worker:review.amendments.empty");
  switch (field) {
    case "systolic":
    case "diastolic":
      return formatMeasurement(Number(value), "mmHg", language);
    case "glucoseValue":
      return glucoseUnit === null
        ? String(value)
        : formatMeasurement(Number(value), glucoseUnit, language);
    case "glucoseUnit":
      return String(value);
    case "glucoseContext":
      return t(domainKey("glucoseContext", value as GlucoseContext));
    case "measuredAt":
      return formatDateTime(String(value), language);
  }
}

const personaName = (id: string) =>
  DEMO_PERSONAS.find((persona) => persona.id === id)?.displayName ?? id;

/** Glucose unit in effect just before amendment `index` (original + earlier unit amendments). */
function unitAt(screening: Screening, index: number): GlucoseUnit | null {
  let unit = screening.glucoseUnit;
  for (const amendment of screening.amendments.slice(0, index)) {
    if (amendment.field === "glucoseUnit") unit = amendment.after as GlucoseUnit | null;
  }
  return unit;
}

export function AmendmentList({ screening }: { screening: Screening }) {
  const t = useTx();
  const { language } = useLanguage();
  if (screening.amendments.length === 0) {
    return (
      <AppText color="muted" testID="amendments-empty">
        {t("worker:review.amendments.none")}
      </AppText>
    );
  }
  return (
    <View style={styles.list} testID="amendment-list" accessibilityRole="list">
      {screening.amendments.map((amendment, index) => {
        const unit = unitAt(screening, index);
        const field = t(domainKey("amendableField", amendment.field));
        const before = formatAmendValue(amendment.field, amendment.before, t, language, unit);
        const after = formatAmendValue(amendment.field, amendment.after, t, language, unit);
        const name = personaName(amendment.amendedBy);
        const time = formatDateTime(amendment.amendedAt, language);
        return (
          <View
            key={amendment.id}
            style={styles.row}
            testID={`amendment-${amendment.id}`}
            accessible
            accessibilityLabel={t("worker:review.amendments.label", {
              field,
              before,
              after,
              reason: amendment.reason,
              name,
              time,
            })}
          >
            <AppText weight="semibold">{field}</AppText>
            <AppText testID="amendment-change">
              {t("worker:review.amendments.change", { before, after })}
            </AppText>
            <AppText variant="caption" testID="amendment-reason">
              {t("worker:review.amendments.reason", { reason: amendment.reason })}
            </AppText>
            <AppText variant="caption" color="muted" testID="amendment-by">
              {t("worker:review.amendments.by", { name, time })}
            </AppText>
          </View>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  list: { gap: spacing.sm },
  row: {
    gap: spacing.xxs,
    padding: spacing.md,
    borderWidth: 1,
    borderColor: colors.borderSoft,
    borderRadius: radii.md,
    backgroundColor: colors.surface,
  },
});
