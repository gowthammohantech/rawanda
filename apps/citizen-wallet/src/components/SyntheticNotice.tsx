/** Soft-blue "made-up demonstration data" callout (CTZ-02 task 1, ref-images welcome). */
import { InfoCallout, useTx } from "@laif/ui-native";

export function SyntheticNotice() {
  const t = useTx();
  return (
    <InfoCallout
      icon="info"
      tone="info"
      title={t("citizen:onboarding.syntheticTitle")}
      testID="synthetic-notice"
    >
      {t("citizen:onboarding.syntheticNotForMedicalUse")}
    </InfoCallout>
  );
}
