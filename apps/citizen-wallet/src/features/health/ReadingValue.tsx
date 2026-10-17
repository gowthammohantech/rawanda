/**
 * Value + unit in large type (CTZ-03). The accessible name spells the unit out: "Blood pressure
 * 152 over 96 millimetres of mercury", "Blood glucose 7.4 millimoles per litre". Unit symbols
 * are identical in both languages; numbers are formatted by `@laif/i18n`.
 */
import type { CitizenReadings, GlucoseUnit } from "@laif/domain";
import { formatMeasurement, formatNumber, useLanguage, type Language } from "@laif/i18n";
import { AppText, spacing, useTx, type TranslationKey } from "@laif/ui-native";
import { StyleSheet, View } from "react-native";

const SPOKEN_UNIT: Record<GlucoseUnit | "mmHg", TranslationKey> = {
  mmHg: "citizen:health.units.mmHgSpoken",
  "mmol/L": "citizen:health.units.mmolLSpoken",
  "mg/dL": "citizen:health.units.mgdLSpoken",
};

export type Reading =
  | { kind: "bloodPressure"; systolic: number; diastolic: number }
  | { kind: "glucose"; value: number; unit: GlucoseUnit };

type Tx = ReturnType<typeof useTx>;

/** The readings of a result that have a value (glucose only with its unit — never bare). */
export function readingsOf(r: CitizenReadings): Reading[] {
  const out: Reading[] = [];
  if (r.systolic !== null && r.diastolic !== null) {
    out.push({ kind: "bloodPressure", systolic: r.systolic, diastolic: r.diastolic });
  }
  if (r.glucoseValue !== null && r.glucoseUnit !== null) {
    out.push({ kind: "glucose", value: r.glucoseValue, unit: r.glucoseUnit });
  }
  return out;
}

export function readingLabel(t: Tx, reading: Reading): string {
  return t(
    reading.kind === "bloodPressure"
      ? "citizen:health.reading.bloodPressure"
      : "citizen:health.reading.glucose",
  );
}

export function readingText(reading: Reading, language: Language): string {
  return reading.kind === "bloodPressure"
    ? formatMeasurement(
        { systolic: reading.systolic, diastolic: reading.diastolic },
        "mmHg",
        language,
      )
    : formatMeasurement(reading.value, reading.unit, language);
}

/** Screen-reader text with the unit's full name. */
export function readingA11yLabel(t: Tx, reading: Reading, language: Language): string {
  if (reading.kind === "bloodPressure") {
    return t("citizen:health.reading.bloodPressureA11y", {
      systolic: formatNumber(reading.systolic, language, { maximumFractionDigits: 0 }),
      diastolic: formatNumber(reading.diastolic, language, { maximumFractionDigits: 0 }),
      unit: t(SPOKEN_UNIT.mmHg),
    });
  }
  const digits = reading.unit === "mmol/L" ? 1 : 0;
  return t("citizen:health.reading.glucoseA11y", {
    value: formatNumber(reading.value, language, {
      minimumFractionDigits: digits,
      maximumFractionDigits: digits,
    }),
    unit: t(SPOKEN_UNIT[reading.unit]),
  });
}

export type ReadingValueProps = {
  reading: Reading;
  size?: "large" | "compact";
  testID?: string;
};

export function ReadingValue({ reading, size = "large", testID }: ReadingValueProps) {
  const t = useTx();
  const { language } = useLanguage();
  const large = size === "large";
  return (
    <View
      accessible
      accessibilityRole="text"
      accessibilityLabel={readingA11yLabel(t, reading, language)}
      style={styles.root}
      testID={testID ?? `reading-${reading.kind}`}
    >
      <AppText variant="caption" color="muted">
        {readingLabel(t, reading)}
      </AppText>
      <AppText variant={large ? "display" : "bodyLarge"} weight="semibold" heading={large}>
        {readingText(reading, language)}
      </AppText>
    </View>
  );
}

const styles = StyleSheet.create({ root: { gap: spacing.xxs } });
