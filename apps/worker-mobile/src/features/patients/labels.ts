/** Patient display helpers (HWM-04): age at the demo date, sex label, match reasons. */
import { patientAgeYears, type Patient, type PatientMatchReason } from "@laif/domain";
import { domainKey } from "@laif/i18n";
import type { TranslationKey, TranslationValues } from "@laif/ui-native";

type Tx = (key: TranslationKey, values?: TranslationValues) => string;

/** "44 years" / "about 59 years (estimated)" / "Age not recorded" (null `now` = loading). */
export function ageLabel(
  patient: Pick<Patient, "dateOfBirth" | "estimatedAgeYears">,
  now: Date | null,
  t: Tx,
): string {
  if (patient.dateOfBirth === null && patient.estimatedAgeYears !== undefined) {
    return t("worker:patients.row.ageEstimated", { count: patient.estimatedAgeYears });
  }
  const age = now === null ? null : patientAgeYears(patient, now);
  return age === null
    ? t("worker:patients.row.ageUnknown")
    : t("worker:patients.row.age", { count: age });
}

export function sexLabel(patient: Pick<Patient, "sexOptional">, t: Tx): string {
  return patient.sexOptional === null
    ? t("worker:patients.row.sexUnknown")
    : t(domainKey("sex", patient.sexOptional));
}

export function matchReasonsLabel(reasons: readonly PatientMatchReason[], t: Tx): string {
  return reasons.map((r) => t(`worker:patients.matchReason.${r}` as TranslationKey)).join(", ");
}
