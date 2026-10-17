import { useTx } from "@laif/ui-native";
import { useLocalSearchParams, useRouter } from "expo-router";

import { TabPlaceholder } from "../../../../src/components/TabPlaceholder.tsx";

/** Screening draft route stub (linked from Today, HWM-03; built in HWM-05). */
export default function ScreeningDraftRoute() {
  const t = useTx();
  const router = useRouter();
  const { draftId } = useLocalSearchParams<{ draftId: string }>();
  return (
    <TabPlaceholder
      title={t("worker:nav.screen")}
      phase="HWM-05"
      testID={`screening-draft-${draftId ?? ""}`}
      onBack={() => (router.canGoBack() ? router.back() : router.replace("/"))}
    />
  );
}
