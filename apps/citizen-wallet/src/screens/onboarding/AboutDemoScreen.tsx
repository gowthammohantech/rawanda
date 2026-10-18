/**
 * "What is this demo?" (CTZ-02 task 2): plain-language points, PROTOTYPE label; CTZ-09 adds
 * "Works without internet" (local-only demo data).
 */
import { AppHeader, AppText, Card, MicroLabel, Screen, spacing, useTx } from "@laif/ui-native";
import { useRouter } from "expo-router";
import { StyleSheet, View } from "react-native";
import { useTitleFocus } from "../../a11y/useTitleFocus.ts";

const POINTS = [
  ["showsTitle", "showsBody"],
  ["neverTitle", "neverBody"],
  ["contactTitle", "contactBody"],
  // CTZ-09 §7: offline is N/A for this local-only app — stated here and in the README.
  ["offlineTitle", "offlineBody"],
] as const;

export function AboutDemoScreen() {
  const t = useTx();
  const titleRef = useTitleFocus();
  const router = useRouter();
  return (
    <Screen
      testID="about-demo-screen"
      header={
        <AppHeader
          titleRef={titleRef}
          title={t("citizen:onboarding.about.title")}
          onBack={() => (router.canGoBack() ? router.back() : router.replace("/welcome"))}
        />
      }
    >
      <MicroLabel tone="warning">{t("citizen:onboarding.about.eyebrow")}</MicroLabel>
      <View style={styles.list}>
        {POINTS.map(([title, body]) => (
          <Card key={title} title={t(`citizen:onboarding.about.${title}`)}>
            <AppText>{t(`citizen:onboarding.about.${body}`)}</AppText>
          </Card>
        ))}
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({ list: { gap: spacing.md } });
