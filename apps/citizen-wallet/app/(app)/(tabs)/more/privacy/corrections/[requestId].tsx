import { useLocalSearchParams } from "expo-router";

import { CorrectionDetailScreen } from "../../../../../../src/features/privacy/CorrectionDetailScreen.tsx";

export default function Route() {
  const { requestId } = useLocalSearchParams<{ requestId: string }>();
  return <CorrectionDetailScreen requestId={typeof requestId === "string" ? requestId : ""} />;
}
