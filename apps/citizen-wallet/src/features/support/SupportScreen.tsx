/**
 * More → Support (CTZ-08 task 6): care team contact, "not for emergencies", "no medical advice",
 * Ask for a callback and Help topics. Reachable WITHOUT consent (and, as `/support`, before a
 * persona is chosen); the callback is then disabled with the reason ("Give consent to send
 * requests"). One `citizen.support.viewed` per focus (signed in only). No clinical content, no
 * emergency number, no monitoring claims.
 */
import {
  AppText,
  Button,
  LoadingState,
  MicroLabel,
  Screen,
  Section,
  spacing,
  useTx,
} from "@laif/ui-native";
import { useRouter } from "expo-router";
import { StyleSheet, View } from "react-native";

import { ConsentFreeHeader } from "../../components/ConsentFreeHeader.tsx";
import { CareTeamContactCard } from "./CareTeamContactCard.tsx";
import { NoMedicalAdviceNote } from "./NoMedicalAdviceNote.tsx";
import { NotAnEmergencyCard } from "./NotAnEmergencyCard.tsx";
import { useCallbackAccess, useSupportViewLog } from "./useSupport.ts";

export type SupportBase = "/more/support" | "/support";

export function SupportScreen({ base = "/more/support" }: { base?: SupportBase }) {
  const t = useTx();
  const router = useRouter();
  const access = useCallbackAccess();
  useSupportViewLog("support");
  const fallback = base === "/support" ? "/welcome" : "/more";

  let callback;
  if (access.status === "loading") {
    callback = <LoadingState label={t("common:state.loading")} />;
  } else {
    const allowed = access.status === "allowed";
    callback = (
      <View style={styles.actions}>
        <Button
          fullWidth
          icon="bell"
          disabled={!allowed}
          accessibilityHint={
            allowed ? t("citizen:support.callbackHint") : t("citizen:support.callbackDisabled")
          }
          onPress={() => router.push("/more/support/callback")}
          testID="support-callback"
        >
          {t("citizen:support.callbackCta")}
        </Button>
        {allowed ? null : (
          <AppText variant="caption" color="muted" testID="support-callback-disabled">
            {access.status === "noPersona"
              ? t("citizen:support.callback.noPersona")
              : t("citizen:support.callbackDisabled")}
          </AppText>
        )}
      </View>
    );
  }

  return (
    <Screen
      testID="support-screen"
      edges={["top", "left", "right"]}
      header={<ConsentFreeHeader title={t("citizen:support.title")} fallback={fallback} />}
    >
      <View style={styles.root}>
        <View style={styles.intro}>
          <MicroLabel>{t("citizen:support.eyebrow")}</MicroLabel>
          <AppText variant="display" accessibilityRole="header">
            {t("citizen:support.title")}
          </AppText>
          <AppText color="muted">{t("citizen:support.intro")}</AppText>
        </View>
        <NotAnEmergencyCard />
        <NoMedicalAdviceNote />
        <Section title={t("citizen:support.careTeam.title")}>
          <CareTeamContactCard />
        </Section>
        <Section title={t("citizen:support.callbackCta")}>{callback}</Section>
        <Button
          variant="secondary"
          icon="info"
          accessibilityHint={t("citizen:support.helpHint")}
          onPress={() => router.push(base === "/support" ? "/support/help" : "/more/support/help")}
          testID="support-help"
        >
          {t("citizen:support.helpCta")}
        </Button>
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  root: { gap: spacing.lg },
  intro: { gap: spacing.xs },
  actions: { gap: spacing.sm },
});
