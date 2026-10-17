/**
 * Reminders tab (CTZ-05 task 6): the reminder toggle card (state + timing summary), SCHEDULED
 * (or "Reminders are off" / "No upcoming reminders"), HISTORY (delivered / seen / cancelled,
 * "Got it" on delivered) and the exact, health-detail-free reminder text. Turning reminders off
 * asks first ("Stop reminders?"), then cancels every scheduled reminder. Runs the simulated
 * delivery on focus. Reminders are only ever for care-team-approved appointments.
 */
import {
  AppText,
  Button,
  ConfirmSheet,
  EmptyState,
  ErrorState,
  LoadingState,
  MicroLabel,
  Screen,
  Section,
  colors,
  spacing,
  useTx,
} from "@laif/ui-native";
import { useFocusEffect, useRouter } from "expo-router";
import { useCallback, useState } from "react";
import { RefreshControl, ScrollView, StyleSheet, View } from "react-native";

import { ConsentRequiredState } from "../../components/ConsentRequiredState.tsx";
import { WalletHeader } from "../../components/WalletHeader.tsx";
import { RepresentativeBanner } from "../health/RepresentativeBanner.tsx";
import { resultErrorKind, useActivePatient } from "../health/useResults.ts";
import { PrefsSaveFeedback } from "./PrefsSaveFeedback.tsx";
import { ReminderHistoryRow } from "./ReminderHistoryRow.tsx";
import { ReminderToggleCard } from "./ReminderToggleCard.tsx";
import { SafeContentNote } from "./SafeContentNote.tsx";
import { ScheduledReminderRow } from "./ScheduledReminderRow.tsx";
import {
  groupReminders,
  useNotificationPrefs,
  useReminderPrefsSave,
  useProcessDueReminders,
  useReminders,
} from "./useReminders.ts";

export function RemindersScreen() {
  const t = useTx();
  const router = useRouter();
  const patient = useActivePatient();
  const patientId = patient?.patientId ?? null;
  const prefs = useNotificationPrefs(patientId);
  const reminders = useReminders(patientId);
  const saver = useReminderPrefsSave(prefs.data ?? null);
  const process = useProcessDueReminders(patientId);
  const [confirmOff, setConfirmOff] = useState(false);
  const [validation, setValidation] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  useFocusEffect(
    useCallback(() => {
      void process();
    }, [process]),
  );

  const refresh = async () => {
    setRefreshing(true);
    try {
      await process();
      await Promise.all([prefs.refetch(), reminders.refetch()]);
    } finally {
      setRefreshing(false);
    }
  };

  const onToggle = (next: boolean) => {
    const shown = saver.shown;
    if (shown === null) return;
    if (!next) {
      setConfirmOff(true);
      return;
    }
    // Opting in needs a timing (always set for seeded preferences; validated anyway).
    if (!shown.timing) {
      setValidation(t("citizen:reminders.validation.timingRequired"));
      return;
    }
    setValidation(null);
    void saver.save({ optedIn: true, timing: shown.timing });
  };

  const error = prefs.error ?? reminders.error;
  let body;
  if (error && resultErrorKind(error) === "consent") {
    body = <ConsentRequiredState />;
  } else if (error) {
    body = (
      <ErrorState
        message={t("citizen:reminders.error")}
        onRetry={() => Promise.all([prefs.refetch(), reminders.refetch()])}
      />
    );
  } else if (prefs.data === undefined || reminders.data === undefined || saver.shown === null) {
    body = <LoadingState variant="skeleton" rows={1} label={t("citizen:reminders.loading")} />;
  } else {
    const shown = saver.shown;
    const groups = groupReminders(reminders.data);
    body = (
      <View style={styles.sections}>
        <ReminderToggleCard
          optedIn={shown.optedIn}
          timing={shown.timing}
          disabled={saver.status === "pending" || saver.status === "conflict"}
          onToggle={onToggle}
        />
        {validation === null ? null : (
          <AppText variant="caption" color="danger" accessibilityRole="alert">
            {validation}
          </AppText>
        )}
        <PrefsSaveFeedback state={saver} />
        <Button
          variant="secondary"
          icon="settings"
          onPress={() => router.push("/reminders/preferences")}
          accessibilityHint={t("citizen:reminders.preferences.openHint")}
          testID="open-reminder-preferences"
        >
          {t("citizen:reminders.preferences.open")}
        </Button>

        <Section title={t("citizen:reminders.section.scheduled")} testID="section-scheduled">
          {!prefs.data!.optedIn ? (
            <EmptyState
              icon="bell"
              title={t("citizen:reminders.toggle.offSummary")}
              description={t("citizen:reminders.empty.offBody")}
            />
          ) : groups.scheduled.length === 0 ? (
            <EmptyState
              icon="calendar"
              title={t("citizen:reminders.empty.scheduled")}
              description={t("citizen:reminders.empty.scheduledBody")}
            />
          ) : (
            <View style={styles.list}>
              {groups.scheduled.map((r) => (
                <ScheduledReminderRow key={r.id} reminder={r} />
              ))}
            </View>
          )}
        </Section>

        <Section title={t("citizen:reminders.section.history")} testID="section-history">
          {groups.history.length === 0 ? (
            <EmptyState icon="clock" title={t("citizen:reminders.empty.history")} />
          ) : (
            <View style={styles.list}>
              {groups.history.map((r) => (
                <ReminderHistoryRow key={r.id} reminder={r} />
              ))}
            </View>
          )}
        </Section>

        <SafeContentNote timing={shown.timing} />
        <AppText variant="caption" color="muted">
          {t("citizen:reminders.demoNote")}
        </AppText>
      </View>
    );
  }

  return (
    <Screen
      testID="reminders-screen"
      edges={["top", "left", "right"]}
      scroll={false}
      header={<WalletHeader title={t("citizen:nav.reminders")} />}
    >
      <ScrollView
        style={styles.flex}
        contentContainerStyle={styles.content}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={refresh} tintColor={colors.primary} />
        }
        testID="reminders-scroll"
      >
        <View style={styles.intro}>
          <MicroLabel>{t("citizen:reminders.eyebrow")}</MicroLabel>
          <AppText variant="display" accessibilityRole="header">
            {t("citizen:reminders.title")}
          </AppText>
          <AppText color="muted">{t("citizen:reminders.subtitle")}</AppText>
        </View>
        <RepresentativeBanner patient={patient} />
        {body}
      </ScrollView>
      <ConfirmSheet
        visible={confirmOff}
        onClose={() => setConfirmOff(false)}
        title={t("citizen:reminders.optOut.confirmTitle")}
        description={t("citizen:reminders.optOut.confirmBody")}
        confirmLabel={t("citizen:reminders.optOut.confirm")}
        cancelLabel={t("citizen:reminders.optOut.cancel")}
        // Not "destructive": that variant adds "This cannot be undone." — reminders can be
        // turned back on at any time.
        onConfirm={() => {
          setConfirmOff(false);
          const shown = saver.shown;
          if (shown !== null) void saver.save({ optedIn: false, timing: shown.timing });
        }}
        testID="reminders-opt-out-confirm"
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  content: { padding: spacing.lg, gap: spacing.lg },
  intro: { gap: spacing.xs },
  sections: { gap: spacing.lg },
  list: { gap: spacing.md },
});
