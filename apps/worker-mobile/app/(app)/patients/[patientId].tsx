import { useLocalSearchParams } from "expo-router";

import { PatientContextScreen } from "../../../src/features/patients/PatientContextScreen.tsx";

/** Patient context (HWM-04). The id is re-checked against the session facility. */
export default function PatientContextRoute() {
  const { patientId } = useLocalSearchParams<{ patientId: string }>();
  return <PatientContextScreen key={patientId ?? ""} patientId={patientId ?? ""} />;
}
