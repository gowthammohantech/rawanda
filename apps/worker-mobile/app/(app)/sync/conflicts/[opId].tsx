import { useLocalSearchParams } from "expo-router";

import { ConflictResolutionScreen } from "../../../../src/features/sync/ConflictResolutionScreen.tsx";

/** Conflict resolution (HWM-09, WF-02 step 4): your version vs the latest, explicit choice. */
export default function ConflictRoute() {
  const { opId } = useLocalSearchParams<{ opId: string }>();
  return <ConflictResolutionScreen key={opId ?? ""} opId={opId ?? ""} />;
}
