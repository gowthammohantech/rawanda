/** "Viewing for Grace K." (CTZ-03 task 9) on every health screen of a legal representative. */
import { InfoCallout, useTx } from "@laif/ui-native";

import type { ActivePatient } from "./useResults.ts";

export function RepresentativeBanner({ patient }: { patient: ActivePatient | null }) {
  const t = useTx();
  if (patient === null || patient.relationship !== "legal_representative") return null;
  return (
    <InfoCallout
      icon="people"
      tone="primary"
      title={t("citizen:health.representative.viewingFor", { name: patient.displayName })}
      testID="representative-banner"
    >
      {t("citizen:health.representative.body", { name: patient.displayName })}
    </InfoCallout>
  );
}
