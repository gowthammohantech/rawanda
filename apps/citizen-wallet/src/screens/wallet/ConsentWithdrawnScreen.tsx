/**
 * Consent withdrawn (CTZ-02 task 8): calm explanation, "Give consent again", "Switch persona".
 * Renders NO health value, count or result name. CTZ-08 task 11: Accessibility and Support stay
 * reachable (consent-free routes) — language and help are needed to decide on consent.
 */
import { Button, InfoCallout, ListRow, Screen, spacing, useTx } from "@laif/ui-native";
import { useRouter } from "expo-router";
import { StyleSheet, View } from "react-native";

import { WalletHeader } from "../../components/WalletHeader.tsx";
import { HREFS } from "../../state/access.ts";
import { useWalletActions } from "../../state/useWalletActions.ts";
import { SupportLink } from "../../features/support/SupportLink.tsx";

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
      <View style={styles.links}>
        <ListRow
          icon="eye"
          title={t("citizen:consent.withdrawnSettings")}
          onPress={() => router.push("/more/accessibility")}
          style={styles.row}
          testID="withdrawn-accessibility"
        />
        <ListRow
          icon="people"
          title={t("citizen:consent.withdrawnSupport")}
          onPress={() => router.push("/more/support")}
          style={styles.row}
          testID="withdrawn-support"
        />
        <SupportLink testID="withdrawn-support-link" />
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  actions: { gap: spacing.sm },
  links: { gap: spacing.sm },
  row: { minHeight: 56 },
});
