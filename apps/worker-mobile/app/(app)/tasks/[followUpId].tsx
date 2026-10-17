import { useTx } from "@laif/ui-native";
import { useLocalSearchParams, useRouter } from "expo-router";

import { TabPlaceholder } from "../../../src/components/TabPlaceholder.tsx";

/** Task detail route stub (linked from Today, HWM-03; built in HWM-07). */
export default function TaskDetailRoute() {
  const t = useTx();
  const router = useRouter();
  const { followUpId } = useLocalSearchParams<{ followUpId: string }>();
  return (
    <TabPlaceholder
      title={t("worker:nav.tasks")}
      phase="HWM-07"
      testID={`task-detail-${followUpId ?? ""}`}
      onBack={() => (router.canGoBack() ? router.back() : router.replace("/"))}
    />
  );
}
