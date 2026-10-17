/** Welcome (CTZ-02 task 1): hero, synthetic-data notice, prominent EN/RW switcher. */
import {
  AppHeader,
  AppText,
  Button,
  LanguageSwitcher,
  RwandaMark,
  Screen,
  Section,
  spacing,
  useTx,
} from "@laif/ui-native";
import { useRouter } from "expo-router";
import { StyleSheet, View } from "react-native";

import { SyntheticNotice } from "../../components/SyntheticNotice.tsx";
import { HREFS } from "../../state/access.ts";

export function WelcomeScreen() {
  const t = useTx();
  const router = useRouter();
  return (
    <Screen
      testID="welcome-screen"
      header={<AppHeader title={t("citizen:appName")} showLanguageSwitcher={false} />}
      footer={
        <View style={styles.actions}>
          <Button
            fullWidth
            icon="arrow"
            iconPosition="end"
            onPress={() => router.push(HREFS.persona)}
          >
            {t("citizen:onboarding.continue")}
          </Button>
          <Button variant="secondary" fullWidth onPress={() => router.push("/about-demo")}>
            {t("citizen:onboarding.whatIsThis")}
          </Button>
          <Button
            variant="ghost"
            size="sm"
            icon="settings"
            onPress={() => router.push("/demo-tools")}
            testID="welcome-demo-tools"
          >
            {t("citizen:onboarding.demoToolsLink")}
          </Button>
        </View>
      }
    >
      <View style={styles.hero}>
        <RwandaMark />
        <AppText variant="display" heading accessibilityRole="header">
          {t("citizen:onboarding.title")}
        </AppText>
        <AppText variant="bodyLarge" color="muted">
          {t("citizen:onboarding.subtitle")}
        </AppText>
      </View>
      <SyntheticNotice />
      <Section title={t("citizen:onboarding.languageLabel")}>
        <LanguageSwitcher testID="welcome-language-switcher" />
      </Section>
    </Screen>
  );
}

const styles = StyleSheet.create({
  hero: { gap: spacing.md, paddingVertical: spacing.lg },
  actions: { gap: spacing.sm },
});
