/** Placeholder tab body (HWM-01): framed by the worker header; filled in by later phases. */
import { EmptyState, Screen, useTx } from "@laif/ui-native";

import { useDemoTools } from "../demo-tools.tsx";
import { AppHeader } from "./AppHeader.tsx";

export function TabPlaceholder({
  title,
  phase,
  testID,
}: {
  title: string;
  phase: string;
  testID: string;
}) {
  const t = useTx();
  const { faults } = useDemoTools();
  return (
    <Screen
      testID={testID}
      edges={["top", "left", "right"]}
      offline={faults.offline}
      header={<AppHeader title={title} />}
    >
      <EmptyState
        icon="clock"
        title={t("worker:placeholder.comingSoon", { phase })}
        description={t("worker:placeholder.description")}
      />
    </Screen>
  );
}
