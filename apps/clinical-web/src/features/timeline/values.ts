/**
 * Display text of one amendable screening value (CLN-04): BP values carry `mmHg`, glucose values
 * carry the screening's unit when one is recorded (never converted), contexts and units use the
 * shared vocabulary, `measuredAt` is shown in Kigali time. Units are not translated.
 */
import {
  GLUCOSE_CONTEXTS,
  GLUCOSE_UNITS,
  type AmendableScreeningField,
  type AmendableValue,
  type GlucoseContext,
  type GlucoseUnit,
} from "@laif/domain";
import {
  domainKey,
  formatDateTime,
  formatMeasurement,
  formatNumber,
  type Language,
} from "@laif/i18n";
import type { TranslationKey, TranslationValues } from "@laif/ui-web";

type Tx = (key: TranslationKey, values?: TranslationValues) => string;

const isUnit = (v: unknown): v is GlucoseUnit =>
  typeof v === "string" && (GLUCOSE_UNITS as readonly string[]).includes(v);
const isContext = (v: unknown): v is GlucoseContext =>
  typeof v === "string" && (GLUCOSE_CONTEXTS as readonly string[]).includes(v);

export function formatAmendableValue(
  field: AmendableScreeningField,
  value: AmendableValue,
  context: { glucoseUnit: GlucoseUnit | null; t: Tx; language: Language },
): string {
  const { t, language, glucoseUnit } = context;
  if (value === null || value === "") return t("clinical:timeline.history.notRecorded");
  switch (field) {
    case "systolic":
    case "diastolic":
      return typeof value === "number" ? formatMeasurement(value, "mmHg", language) : String(value);
    case "glucoseValue":
      if (typeof value !== "number") return String(value);
      return glucoseUnit === null
        ? `${formatNumber(value, language)} (${t("clinical:timeline.unitMissing.title")})`
        : formatMeasurement(value, glucoseUnit, language);
    case "glucoseUnit":
      return isUnit(value) ? value : String(value);
    case "glucoseContext":
      return isContext(value) ? t(domainKey("glucoseContext", value)) : String(value);
    case "measuredAt":
      return typeof value === "string" ? formatDateTime(value, language) : String(value);
  }
}
