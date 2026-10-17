/** Translated display helpers shared by the patient search and record screens (CLN-03). */
import type { Sex } from "@laif/domain";
import { domainKey } from "@laif/i18n";
import type { TranslationKey, TranslationValues } from "@laif/ui-web";

type Tx = (key: TranslationKey, values?: TranslationValues) => string;

export function ageLabel(t: Tx, age: { ageYears: number | null; ageEstimated: boolean }): string {
  if (age.ageYears === null) return t("clinical:patients.table.ageUnknown");
  return t(
    age.ageEstimated ? "clinical:patients.table.ageEstimated" : "clinical:patients.table.age",
    {
      age: age.ageYears,
    },
  );
}

export function sexLabel(t: Tx, sex: Sex | null): string {
  return t(domainKey("sex", sex ?? "not_recorded"));
}

export function ageSexLabel(
  t: Tx,
  row: { ageYears: number | null; ageEstimated: boolean; sexOptional: Sex | null },
): string {
  return `${ageLabel(t, row)} · ${sexLabel(t, row.sexOptional)}`;
}
