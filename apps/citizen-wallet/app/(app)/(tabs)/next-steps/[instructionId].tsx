import { useLocalSearchParams } from "expo-router";

import { NextStepDetailScreen } from "../../../../src/features/next-steps/NextStepDetailScreen.tsx";

export default function Route() {
  const { instructionId } = useLocalSearchParams<{ instructionId?: string | string[] }>();
  const id = Array.isArray(instructionId) ? (instructionId[0] ?? "") : (instructionId ?? "");
  return <NextStepDetailScreen instructionId={id} />;
}
