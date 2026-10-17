import { useLocalSearchParams } from "expo-router";

import { ScreeningFormScreen } from "../../../../../src/features/screening/ScreeningFormScreen.tsx";

/**
 * Screening form for one device-local draft (HWM-05). Scope re-checked on load. `revalidate=1`
 * (from the HWM-06 review screen) opens it with the error summary shown.
 */
export default function ScreeningDraftRoute() {
  const { draftId, revalidate } = useLocalSearchParams<{ draftId: string; revalidate?: string }>();
  return (
    <ScreeningFormScreen
      key={draftId ?? ""}
      draftId={draftId ?? ""}
      revalidate={revalidate === "1"}
    />
  );
}
