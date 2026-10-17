/**
 * Neutral "date has passed" notice (CTZ-04 task 5): shown only while the step is still planned
 * and its date is before the demo clock (`deriveDatePassed`). Never "overdue" or "missed" — the
 * wallet has no approved timing rules (FRD §5).
 */
import { InfoCallout, useTx } from "@laif/ui-native";

export function DatePassedNotice() {
  const t = useTx();
  return (
    <InfoCallout icon="clock" testID="date-passed">
      {t("citizen:nextSteps.datePassed")}
    </InfoCallout>
  );
}
