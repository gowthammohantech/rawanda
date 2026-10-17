/** More tab (CTZ-02): consent, demo tools, language. Privacy / accessibility / support: CTZ-07/08. */
import { EmptyState, LanguageSwitcher, ListRow, Screen, Section, useTx } from "@laif/ui-native";
import { useRouter } from "expo-router";

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
      <Section title={t("citizen:consent.manageTitle")}>
        <ListRow
          icon="shield"
          title={t("citizen:more.consentRow")}
          onPress={() => router.push("/more/consent")}
          testID="more-consent"
        />
      </Section>
      <Section title={t("citizen:more.languageTitle")}>
        <LanguageSwitcher testID="more-language-switcher" />
      </Section>
      <Section title={t("citizen:more.demo.eyebrow")}>
        <ListRow
          icon="settings"
          title={t("citizen:more.demoToolsRow")}
          onPress={() => router.push("/more/demo-tools")}
          testID="more-demo-tools"
        />
      </Section>
      {__DEV__ ? <EmptyState icon="clock" description={t("citizen:more.comingSoon")} /> : null}
    </Screen>
  );
}
