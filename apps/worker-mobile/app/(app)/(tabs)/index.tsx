import { useTx } from "@laif/ui-native";

import { TabPlaceholder } from "../../../src/components/TabPlaceholder.tsx";

/** Placeholder (built in HWM-03). */
export default function TodayTab() {
  const t = useTx();
  return <TabPlaceholder title={t("worker:nav.today")} phase="HWM-03" testID="today-screen" />;
}
