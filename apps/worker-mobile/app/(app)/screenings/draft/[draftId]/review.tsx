import { useTx } from "@laif/ui-native";
import { useLocalSearchParams, useRouter } from "expo-router";

import { TabPlaceholder } from "../../../../../src/components/TabPlaceholder.tsx";

/** Review route stub (HWM-05 "Review" target; built in HWM-06). Back returns to the form. */
export default function ScreeningReviewRoute() {
  const t = useTx();
  const router = useRouter();
  const { draftId } = useLocalSearchParams<{ draftId: string }>();
  return (
    <TabPlaceholder
      title={t("worker:screening.reviewStub.title")}
      phase="HWM-06"
      testID={`screening-review-${draftId ?? ""}`}
      onBack={() =>
        router.canGoBack()
          ? router.back()
          : router.replace({
              pathname: "/screenings/draft/[draftId]",
              params: { draftId: draftId ?? "" },
            })
      }
    />
  );
}
