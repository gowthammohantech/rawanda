import { useLocalSearchParams } from "expo-router";

import { RecordOutcomeScreen } from "../../../../src/features/followup/RecordOutcomeForm.tsx";

/** Record the outcome of a task — attended, referred onward, unable to reach (HWM-08). */
export default function TaskRecordOutcomeRoute() {
  const { followUpId } = useLocalSearchParams<{ followUpId: string }>();
  return <RecordOutcomeScreen key={followUpId ?? ""} followUpId={followUpId ?? ""} />;
}
