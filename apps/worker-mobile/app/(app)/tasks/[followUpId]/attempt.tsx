import { useTx } from "@laif/ui-native";
import { useLocalSearchParams, useRouter } from "expo-router";

import { TabPlaceholder } from "../../../../src/components/TabPlaceholder.tsx";

/** Record attempt route stub (linked from task detail, HWM-07; built in HWM-08). */
export default function TaskRecordAttemptRoute() {
  const t = useTx();
  const router = useRouter();
  const { followUpId } = useLocalSearchParams<{ followUpId: string }>();
  return (
    <TabPlaceholder
      title={t("worker:tasks.recordAttempt")}
      phase="HWM-08"
      testID={`task-attempt-${followUpId ?? ""}`}
      onBack={() => (router.canGoBack() ? router.back() : router.replace("/tasks"))}
    />
  );
}
