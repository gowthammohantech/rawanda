import { useLocalSearchParams } from "expo-router";

import { ScreeningDetailScreen } from "../../../../src/features/screening/ScreeningDetailScreen.tsx";

/** Submitted screening detail with sync timeline and corrections (HWM-06). */
export default function ScreeningDetailRoute() {
  const { screeningId } = useLocalSearchParams<{ screeningId: string }>();
  return <ScreeningDetailScreen key={screeningId ?? ""} screeningId={screeningId ?? ""} />;
}
