/** "Your record has not been changed…" (CTZ-07 task 10; tech spec §8: source record unchanged). */
import { InfoCallout, useTx } from "@laif/ui-native";

export function RecordUnchangedNote() {
  const t = useTx();
  return (
    <InfoCallout icon="shield" tone="primary" testID="record-unchanged">
      {t("citizen:correction.unchanged")}
    </InfoCallout>
  );
}
