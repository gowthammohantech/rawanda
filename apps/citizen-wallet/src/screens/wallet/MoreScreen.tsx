/**
 * More tab hub (CTZ-02, regrouped in CTZ-07 task 1): `MY DATA` (Privacy, Consent), `SETTINGS`
 * (language, Accessibility), `HELP` (Support) and `DEMO` (demo tools) — 56 pt rows with chevrons.
 * Accessibility and Support screens arrive in CTZ-08 (rows shown, disabled, labelled).
 */
import { LanguageSwitcher, ListRow, Screen, Section, spacing, useTx } from "@laif/ui-native";
import { useRouter } from "expo-router";
import { StyleSheet, View } from "react-native";

import { WalletHeader } from "../../components/WalletHeader.tsx";

export function MoreScreen() {
  const t = useTx();
  const router = useRouter();
  return (
    <Screen
      testID="more-screen"
      edges={["top", "left", "right"]}
      header={<WalletHeader title={t("citizen:nav.more")} />}
    >
      <View style={styles.root}>
        <Section title={t("citizen:more.sections.myData")} testID="more-section-my-data">
          <ListRow
            icon="eye"
            title={t("citizen:more.privacyRow")}
            subtitle={t("citizen:more.privacySub")}
            onPress={() => router.push("/more/privacy")}
            style={styles.row}
            testID="more-privacy"
          />
          <ListRow
            icon="shield"
            title={t("citizen:more.consentRow")}
            subtitle={t("citizen:more.consentSub")}
            onPress={() => router.push("/more/consent")}
            style={styles.row}
            testID="more-consent"
          />
        </Section>
        <Section title={t("citizen:more.sections.settings")} testID="more-section-settings">
          <LanguageSwitcher testID="more-language-switcher" />
          <ListRow
            icon="settings"
            title={t("citizen:more.accessibilityRow")}
            subtitle={t("citizen:more.laterPhase")}
            disabled
            style={styles.row}
            testID="more-accessibility"
          />
        </Section>
        <Section title={t("citizen:more.sections.help")} testID="more-section-help">
          <ListRow
            icon="people"
            title={t("citizen:more.supportRow")}
            subtitle={t("citizen:more.laterPhase")}
            disabled
            style={styles.row}
            testID="more-support"
          />
        </Section>
        <Section title={t("citizen:more.sections.demo")} testID="more-section-demo">
          <ListRow
            icon="settings"
            title={t("citizen:more.demoToolsRow")}
            subtitle={t("citizen:more.demoToolsSub")}
            onPress={() => router.push("/more/demo-tools")}
            style={styles.row}
            testID="more-demo-tools"
          />
        </Section>
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  root: { gap: spacing.lg },
  row: { minHeight: 56 },
});
