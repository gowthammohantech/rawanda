import { useLocalSearchParams } from "expo-router";

import { NewScreeningScreen } from "../../../src/features/screening/NewScreeningScreen.tsx";

/** `/screenings/new?patientId=` → resume or create the draft, then replace to the form (HWM-05). */
export default function NewScreeningRoute() {
  const { patientId } = useLocalSearchParams<{ patientId?: string }>();
  return <NewScreeningScreen key={patientId ?? ""} patientId={patientId ?? ""} />;
}
