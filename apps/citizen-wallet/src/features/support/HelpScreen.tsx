/** Help topics (CTZ-08 task 8): static plain-language answers; one `citizen.help.viewed` per focus. */
import { AppText, MicroLabel, Screen, spacing, useTx } from "@laif/ui-native";
import { StyleSheet, View } from "react-native";

import { ConsentFreeHeader } from "../../components/ConsentFreeHeader.tsx";
import { usePersona } from "../../providers.tsx";
import { HelpTopicList } from "./HelpTopicList.tsx";
import type { SupportBase } from "./SupportScreen.tsx";
import { useSupportViewLog } from "./useSupport.ts";

export function HelpScreen({ base = "/more/support" }: { base?: SupportBase }) {
  const t = useTx();
  const signedIn = usePersona() !== null;
  useSupportViewLog("help");
  return (
    <Screen
      testID="help-screen"
      edges={["top", "left", "right"]}
      header={<ConsentFreeHeader title={t("citizen:help.title")} fallback={base} />}
    >
      <View style={styles.root}>
        <View style={styles.intro}>
          <MicroLabel>{t("citizen:help.eyebrow")}</MicroLabel>
          <AppText variant="display" accessibilityRole="header">
            {t("citizen:help.title")}
          </AppText>
          <AppText color="muted">{t("citizen:help.intro")}</AppText>
        </View>
        <HelpTopicList signedIn={signedIn} />
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({ root: { gap: spacing.lg }, intro: { gap: spacing.xs } });
