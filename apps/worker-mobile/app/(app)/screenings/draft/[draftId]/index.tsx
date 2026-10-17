import { useLocalSearchParams } from "expo-router";

import { ScreeningFormScreen } from "../../../../../src/features/screening/ScreeningFormScreen.tsx";

/** Screening form for one device-local draft (HWM-05). Scope re-checked on load. */
export default function ScreeningDraftRoute() {
  const { draftId } = useLocalSearchParams<{ draftId: string }>();
  return <ScreeningFormScreen key={draftId ?? ""} draftId={draftId ?? ""} />;
}
