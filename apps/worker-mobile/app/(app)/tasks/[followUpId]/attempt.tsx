import { useLocalSearchParams } from "expo-router";

import { RecordAttemptScreen } from "../../../../src/features/followup/RecordAttemptForm.tsx";

/** Record a contact attempt on a task (HWM-08). */
export default function TaskRecordAttemptRoute() {
  const { followUpId } = useLocalSearchParams<{ followUpId: string }>();
  return <RecordAttemptScreen key={followUpId ?? ""} followUpId={followUpId ?? ""} />;
}
