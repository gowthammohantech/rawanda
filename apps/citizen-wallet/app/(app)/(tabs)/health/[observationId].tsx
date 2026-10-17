import { useLocalSearchParams } from "expo-router";

import { ResultDetailScreen } from "../../../../src/features/health/ResultDetailScreen.tsx";

export default function Route() {
  const { observationId } = useLocalSearchParams<{ observationId?: string | string[] }>();
  const id = Array.isArray(observationId) ? (observationId[0] ?? "") : (observationId ?? "");
  return <ResultDetailScreen observationId={id} />;
}
