import type { GlucoseContext, GlucoseUnit } from "@laif/domain";
import { domainKey, formatMeasurement, formatNumber, useLanguage } from "@laif/i18n";
import { StyleSheet, View } from "react-native";

import { useTx } from "../i18n.ts";
import { spacing } from "../tokens.ts";
import { AppText } from "./AppText.tsx";
import { StatusChip } from "./StatusChip.tsx";

export type ReadingDisplayProps =
  | { kind: "bloodPressure"; systolic: number; diastolic: number; large?: boolean }
  | {
      kind: "glucose";
      value: number;
      /** `null` = unit missing → value shown with an `UNIT MISSING` chip (never a bare number). */
      unit: GlucoseUnit | null;
      context?: GlucoseContext | null;
      large?: boolean;
    }
  | { kind: "measurement"; value: number; unit: string | null; large?: boolean };

/** Clinical value + unit, always: `148/92 mmHg`, `7.8 mmol/L · non-fasting`. */
export function ReadingDisplay(props: ReadingDisplayProps) {
  const t = useTx();
  const { language } = useLanguage();
  const variant = props.large === true ? "title" : "body";
  if (props.kind === "bloodPressure") {
    return (
      <AppText variant={variant} weight="semibold" heading={false} testID="reading-value">
        {formatMeasurement(
          { systolic: props.systolic, diastolic: props.diastolic },
          "mmHg",
          language,
        )}
      </AppText>
    );
  }
  const unit = props.unit;
  const missing = unit === null || unit.trim() === "";
  const context =
    props.kind === "glucose" && props.context !== undefined && props.context !== null
      ? t(domainKey("glucoseContext", props.context))
      : null;
  return (
    <View style={styles.row}>
      <AppText variant={variant} weight="semibold" heading={false} testID="reading-value">
        {missing
          ? formatNumber(props.value, language)
          : formatMeasurement(props.value, unit, language)}
      </AppText>
      {missing ? <StatusChip tone="warning">{t("common:ui.unitMissing")}</StatusChip> : null}
      {context === null ? null : (
        <AppText variant="caption" color="muted">
          {`· ${context}`}
        </AppText>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: "row", flexWrap: "wrap", alignItems: "center", gap: spacing.sm },
});
