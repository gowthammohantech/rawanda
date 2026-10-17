/**
 * Reminder preferences (CTZ-05 task 8): timing (the day before / the morning of — fixed demo
 * times), the read-only channel "In this app (demo)", the exact reminder text and — on a device
 * only — "Send a test reminder to this phone". A timing change re-plans the scheduled reminders
 * (`timing_changed`); while reminders are off the choice is saved for later and nothing is
 * scheduled. Conflict / server error → the saved value is shown + notice / Retry.
 */
import {
  AppText,
  ErrorState,
  KeyValueList,
  LoadingState,
  Screen,
  Section,
  spacing,
  useTx,
} from "@laif/ui-native";
import { useRouter } from "expo-router";
import { StyleSheet, View } from "react-native";

import { ConsentRequiredState } from "../../components/ConsentRequiredState.tsx";
import { WalletHeader } from "../../components/WalletHeader.tsx";
import { resultErrorKind, useActivePatient } from "../health/useResults.ts";
import { PreviewNotificationButton } from "./PreviewNotificationButton.tsx";
import { PrefsSaveFeedback } from "./PrefsSaveFeedback.tsx";
import { SafeContentNote } from "./SafeContentNote.tsx";
import { TimingSelector } from "./TimingSelector.tsx";
import { useNotificationPrefs, useReminderPrefsSave } from "./useReminders.ts";

export function ReminderPreferencesScreen() {
  const t = useTx();
  const router = useRouter();
  const patientId = useActivePatient()?.patientId ?? null;
  const prefs = useNotificationPrefs(patientId);
  const saver = useReminderPrefsSave(prefs.data ?? null);
  const back = () => (router.canGoBack() ? router.back() : router.replace("/reminders"));

  let body;
  if (prefs.isError && resultErrorKind(prefs.error) === "consent") {
    body = <ConsentRequiredState />;
  } else if (prefs.isError) {
    body = <ErrorState message={t("citizen:reminders.error")} onRetry={() => prefs.refetch()} />;
  } else if (prefs.data === undefined || saver.shown === null || patientId === null) {
    body = <LoadingState variant="skeleton" rows={1} label={t("citizen:reminders.loading")} />;
  } else {
    const shown = saver.shown;
    body = (
      <View style={styles.sections}>
        <TimingSelector
          value={shown.timing}
          disabled={saver.status === "pending" || saver.status === "conflict"}
          onChange={(timing) => {
            if (timing !== shown.timing) void saver.save({ optedIn: shown.optedIn, timing });
          }}
        />
        {shown.optedIn ? null : (
          <AppText color="muted" testID="prefs-off-note">
            {t("citizen:reminders.preferences.offNote")}
          </AppText>
        )}
        <PrefsSaveFeedback state={saver} />
        <Section title={t("citizen:reminders.channel.label")}>
          <KeyValueList
            testID="reminder-channel"
            items={[
              {
                id: "channel",
                label: t("citizen:reminders.channel.label"),
                value: t("citizen:reminders.channel.inApp"),
              },
            ]}
          />
        </Section>
        <SafeContentNote timing={shown.timing} />
        <PreviewNotificationButton patientId={patientId} timing={shown.timing} />
      </View>
    );
  }

  return (
    <Screen
      testID="reminder-preferences-screen"
      edges={["top", "left", "right"]}
      header={<WalletHeader title={t("citizen:reminders.preferences.title")} onBack={back} />}
    >
      {body}
    </Screen>
  );
}

const styles = StyleSheet.create({ sections: { gap: spacing.lg } });
