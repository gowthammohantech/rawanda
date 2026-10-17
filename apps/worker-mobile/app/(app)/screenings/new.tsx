import { useTx } from "@laif/ui-native";
import { useLocalSearchParams, useRouter } from "expo-router";

import { TabPlaceholder } from "../../../src/components/TabPlaceholder.tsx";

/** New screening route stub (linked from the patient context, HWM-04; built in HWM-05). */
export default function NewScreeningRoute() {
  const t = useTx();
  const router = useRouter();
  const { patientId } = useLocalSearchParams<{ patientId?: string }>();
  return (
    <TabPlaceholder
      title={t("worker:nav.screen")}
      phase="HWM-05"
      testID={`screening-new-${patientId ?? ""}`}
      onBack={() => (router.canGoBack() ? router.back() : router.replace("/"))}
    />
  );
}
