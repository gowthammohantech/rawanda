import { useLocalSearchParams } from "expo-router";

import { ScreeningReviewScreen } from "../../../../../src/features/screening/ScreeningReviewScreen.tsx";

/** Review + submit of one device-local draft (HWM-06). */
export default function ScreeningReviewRoute() {
  const { draftId } = useLocalSearchParams<{ draftId: string }>();
  return <ScreeningReviewScreen key={draftId ?? ""} draftId={draftId ?? ""} />;
}
