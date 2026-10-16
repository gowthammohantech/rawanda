import { useTx } from "@laif/ui-native";

import { TabPlaceholder } from "../../../../src/components/TabPlaceholder.tsx";

/** Placeholder (built in HWM-09). */
export default function SyncTab() {
  const t = useTx();
  return <TabPlaceholder title={t("worker:nav.sync")} phase="HWM-09" testID="sync-screen" />;
}
