import { useTx } from "@laif/ui-native";

import { TabPlaceholder } from "../../../src/components/TabPlaceholder.tsx";

/** Placeholder (built in HWM-05). */
export default function ScreenTab() {
  const t = useTx();
  return <TabPlaceholder title={t("worker:nav.screen")} phase="HWM-05" testID="screen-screen" />;
}
