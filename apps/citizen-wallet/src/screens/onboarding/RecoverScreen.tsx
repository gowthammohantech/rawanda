/** Safe-recovery stub (CTZ-02 task 5): recovery happens with the care team at the facility. */
import { AppHeader, AppText, Button, Card, InfoCallout, Screen, useTx } from "@laif/ui-native";
import { useRouter } from "expo-router";

import { useWalletActions } from "../../state/useWalletActions.ts";

export function RecoverScreen() {
  const t = useTx();
  const router = useRouter();
  const { endSession } = useWalletActions();
  return (
    <Screen
      testID="recover-screen"
      header={<AppHeader title={t("citizen:onboarding.recover.title")} />}
      footer={
        <Button
          fullWidth
          variant="secondary"
          onPress={async () => {
            router.replace("/welcome");
            await endSession();
          }}
        >
          {t("citizen:onboarding.recover.back")}
        </Button>
      }
    >
      <InfoCallout icon="lock" tone="info">
        {t("citizen:onboarding.recover.body")}
      </InfoCallout>
      <Card title={t("citizen:onboarding.recover.contactTitle")}>
        <AppText>{t("citizen:onboarding.recover.contactBody")}</AppText>
      </Card>
    </Screen>
  );
}
