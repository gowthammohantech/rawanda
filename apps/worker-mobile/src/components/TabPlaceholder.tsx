/**
 * Placeholder body (HWM-01): framed by the worker header; filled in by later phases. Also used
 * for route stubs (HWM-03: task detail until HWM-07, draft until HWM-05) with a back button.
 */
import { EmptyState, Screen, useTx } from "@laif/ui-native";

import { useDemoTools } from "../demo-tools.tsx";
import { AppHeader } from "./AppHeader.tsx";

export function TabPlaceholder({
  title,
  phase,
  testID,
  onBack,
}: {
  title: string;
  phase: string;
  testID: string;
  onBack?: () => void;
}) {
  const t = useTx();
  const { faults } = useDemoTools();
  return (
    <Screen
      testID={testID}
      edges={["top", "left", "right"]}
      offline={faults.offline}
      header={<AppHeader title={title} {...(onBack === undefined ? {} : { onBack })} />}
    >
      <EmptyState
        icon="clock"
        title={t("worker:placeholder.comingSoon", { phase })}
        description={t("worker:placeholder.description")}
      />
    </Screen>
  );
}
