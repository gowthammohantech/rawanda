/**
 * Consent withdrawn (CTZ-02 task 8): calm explanation, "Give consent again", "Switch persona".
 * Renders NO health value, count or result name.
 */
import { Button, InfoCallout, Screen, spacing, useTx } from "@laif/ui-native";
import { useRouter } from "expo-router";
import { StyleSheet, View } from "react-native";

import { WalletHeader } from "../../components/WalletHeader.tsx";
import { HREFS } from "../../state/access.ts";
import { useWalletActions } from "../../state/useWalletActions.ts";

export function ConsentWithdrawnScreen() {
  const t = useTx();
  const router = useRouter();
  const { endSession } = useWalletActions();
  return (
    <Screen
      testID="consent-withdrawn-screen"
      header={<WalletHeader title={t("citizen:consent.withdrawnTitle")} />}
      footer={
        <View style={styles.actions}>
          <Button fullWidth onPress={() => router.push(HREFS.consent)} testID="give-again">
            {t("citizen:consent.giveAgain")}
          </Button>
          <Button
            variant="secondary"
            fullWidth
            onPress={async () => {
              router.replace(HREFS.persona);
              await endSession();
            }}
          >
            {t("citizen:onboarding.header.switchPersona")}
          </Button>
        </View>
      }
    >
      <InfoCallout icon="lock" tone="info">
        {t("citizen:consent.withdrawnBody")}
      </InfoCallout>
    </Screen>
  );
}

const styles = StyleSheet.create({ actions: { gap: spacing.sm } });
