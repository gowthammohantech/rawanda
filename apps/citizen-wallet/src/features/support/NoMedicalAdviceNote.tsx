/** "This app does not give medical advice" (CTZ-08 task 6; clinical + legal review pending). */
import { InfoCallout, useTx } from "@laif/ui-native";

export function NoMedicalAdviceNote() {
  const t = useTx();
  return (
    <InfoCallout icon="info" title={t("citizen:support.noAdviceTitle")} testID="no-medical-advice">
      {`${t("citizen:support.noAdvice")} ${t("citizen:support.noAdviceMore")}`}
    </InfoCallout>
  );
}
