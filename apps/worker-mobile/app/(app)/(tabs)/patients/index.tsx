import { useTx } from "@laif/ui-native";

import { TabPlaceholder } from "../../../../src/components/TabPlaceholder.tsx";

/** Placeholder (built in HWM-04). */
export default function FindTab() {
  const t = useTx();
  return <TabPlaceholder title={t("worker:nav.find")} phase="HWM-04" testID="find-screen" />;
}
