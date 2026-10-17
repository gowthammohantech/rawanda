/**
 * Save feedback for reminder preferences (CTZ-05 task 10): a stale conflict (T-05) shows what
 * is saved now ("Reminders are off" / timing summary) with OK; a server error (T-09) shows an
 * inline error + Retry (same idempotency key). In both cases the controls already show the
 * saved value.
 */
import { Button, InfoCallout, spacing, useTx } from "@laif/ui-native";
import { StyleSheet, View } from "react-native";

import { InlineError } from "../../components/InlineError.tsx";
import { reminderSummaryKey } from "./ReminderToggleCard.tsx";
import type { PrefsSaveState } from "./useReminders.ts";

export function PrefsSaveFeedback({ state }: { state: PrefsSaveState }) {
  const t = useTx();
  if (state.status === "conflict") {
    const saved = state.shown;
    return (
      <View style={styles.root} accessibilityRole="alert" testID="prefs-conflict">
        <InfoCallout icon="refresh" title={t("citizen:reminders.conflict.title")}>
          {`${t("citizen:reminders.conflict.body")} ${
            saved === null ? "" : t(reminderSummaryKey(saved.optedIn, saved.timing))
          }`.trim()}
        </InfoCallout>
        <Button variant="secondary" onPress={state.dismissConflict} testID="prefs-conflict-ok">
          {t("citizen:reminders.conflict.dismiss")}
        </Button>
      </View>
    );
  }
  if (state.status === "error") {
    return (
      <View style={styles.root} testID="prefs-error">
        <InlineError message={t("citizen:reminders.saveError")} />
        <Button variant="secondary" icon="refresh" onPress={state.retry} testID="prefs-retry">
          {t("citizen:reminders.retry")}
        </Button>
      </View>
    );
  }
  return null;
}

const styles = StyleSheet.create({ root: { gap: spacing.sm } });
