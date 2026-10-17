import { useTx } from "@laif/ui-native";
import { useLocalSearchParams, useRouter } from "expo-router";

import { TabPlaceholder } from "../../../../src/components/TabPlaceholder.tsx";

/** Record outcome route stub (linked from task detail, HWM-07; built in HWM-08). */
export default function TaskRecordOutcomeRoute() {
  const t = useTx();
  const router = useRouter();
  const { followUpId } = useLocalSearchParams<{ followUpId: string }>();
  return (
    <TabPlaceholder
      title={t("worker:tasks.recordOutcome")}
      phase="HWM-08"
      testID={`task-outcome-${followUpId ?? ""}`}
      onBack={() => (router.canGoBack() ? router.back() : router.replace("/tasks"))}
    />
  );
}
