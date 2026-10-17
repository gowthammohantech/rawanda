import { useLocalSearchParams } from "expo-router";

import { RegisterPatientScreen } from "../../../src/features/patients/RegisterPatientScreen.tsx";

/** Register a synthetic patient (HWM-04); `?name=` prefills from an empty search. */
export default function RegisterPatientRoute() {
  const { name } = useLocalSearchParams<{ name?: string }>();
  return <RegisterPatientScreen {...(typeof name === "string" ? { initialName: name } : {})} />;
}
