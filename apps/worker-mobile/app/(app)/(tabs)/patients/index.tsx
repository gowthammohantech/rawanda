import { useLocalSearchParams } from "expo-router";

import { FindPatientScreen } from "../../../../src/features/patients/FindPatientScreen.tsx";

/** Find tab (HWM-04): cached facility-scoped patient search; `?mode=pick` = screening picker (HWM-05). */
export default function FindTab() {
  const { mode } = useLocalSearchParams<{ mode?: string }>();
  return <FindPatientScreen pick={mode === "pick"} />;
}
