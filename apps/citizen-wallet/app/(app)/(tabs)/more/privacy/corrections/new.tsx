import { useLocalSearchParams } from "expo-router";

import { CorrectionFlowScreen } from "../../../../../../src/features/privacy/CorrectionFlowScreen.tsx";

/** `?targetType=screening&targetId=…` preselects the item (from a result / next step). */
export default function Route() {
  const { targetType, targetId } = useLocalSearchParams<{
    targetType?: string;
    targetId?: string;
  }>();
  return (
    <CorrectionFlowScreen
      {...(typeof targetType === "string" ? { initialTargetType: targetType } : {})}
      {...(typeof targetId === "string" ? { initialTargetId: targetId } : {})}
    />
  );
}
