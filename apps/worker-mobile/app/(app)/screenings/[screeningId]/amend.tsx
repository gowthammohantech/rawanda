import { useLocalSearchParams } from "expo-router";

import { AmendScreeningScreen } from "../../../../src/features/screening/AmendScreeningForm.tsx";

/** Correct one value of a submitted screening, with a reason (HWM-06). */
export default function AmendScreeningRoute() {
  const { screeningId } = useLocalSearchParams<{ screeningId: string }>();
  return <AmendScreeningScreen key={screeningId ?? ""} screeningId={screeningId ?? ""} />;
}
