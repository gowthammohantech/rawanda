import { useTx } from "@laif/ui-native";

import { TabPlaceholder } from "../../../../src/components/TabPlaceholder.tsx";

/** Placeholder (built in HWM-07). */
export default function TasksTab() {
  const t = useTx();
  return <TabPlaceholder title={t("worker:nav.tasks")} phase="HWM-07" testID="tasks-screen" />;
}
