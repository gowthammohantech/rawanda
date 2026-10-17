/** "What is this demo?" (CTZ-02 task 2): three plain-language points, PROTOTYPE label. */
import { AppHeader, AppText, Card, MicroLabel, Screen, spacing, useTx } from "@laif/ui-native";
import { useRouter } from "expo-router";
import { StyleSheet, View } from "react-native";

const POINTS = [
  ["showsTitle", "showsBody"],
  ["neverTitle", "neverBody"],
  ["contactTitle", "contactBody"],
] as const;

export function AboutDemoScreen() {
  const t = useTx();
  const router = useRouter();
  return (
    <Screen
      testID="about-demo-screen"
      header={
        <AppHeader
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
