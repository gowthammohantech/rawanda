/** Privacy notice route (CTZ-07 task 3); one `citizen.privacy_notice.viewed` per focus. */
import { Screen, useTx } from "@laif/ui-native";
import { useRouter } from "expo-router";

import { WalletHeader } from "../../components/WalletHeader.tsx";
import { PrivacyNoticeBody } from "./PrivacyNoticeBody.tsx";
import { usePrivacyNoticeViewLog } from "./usePrivacy.ts";

export function PrivacyNoticeScreen() {
  const t = useTx();
  const router = useRouter();
  usePrivacyNoticeViewLog();
  const back = () => (router.canGoBack() ? router.back() : router.replace("/more/privacy"));
  return (
    <Screen
      testID="privacy-notice-screen"
      edges={["top", "left", "right"]}
      header={<WalletHeader title={t("citizen:privacy.notice.title")} onBack={back} />}
    >
      <PrivacyNoticeBody
        onOpenConsent={() => router.push("/more/consent")}
        onAskCorrection={() => router.push("/more/privacy/corrections/new")}
      />
    </Screen>
  );
}
