/**
 * Shows the EXACT reminder text the person would see (CTZ-05 task 6) — from `safeContent.ts`,
 * in the current language — and why it is safe on a shared phone.
 */
import type { ReminderTiming } from "@laif/domain";
import { AppText, InfoCallout, colors, radii, spacing, useTx } from "@laif/ui-native";
import { StyleSheet, View } from "react-native";

import { safeReminderContent } from "./safeContent.ts";

export function SafeContentNote({ timing }: { timing: ReminderTiming }) {
  const t = useTx();
  const content = safeReminderContent(t, timing);
  return (
    <View style={styles.root} testID="safe-content-note">
      <InfoCallout icon="shield" title={t("citizen:reminders.safe.noteTitle")}>
        {t("citizen:reminders.safe.noteBody")}
      </InfoCallout>
      <View
        style={styles.preview}
        accessible
        accessibilityLabel={`${content.title}. ${content.body}`}
        testID="safe-content-preview"
      >
        <AppText weight="semibold">{content.title}</AppText>
        <AppText color="muted">{content.body}</AppText>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { gap: spacing.sm },
  preview: {
    gap: spacing.xxs,
    padding: spacing.md,
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: colors.borderSoft,
    backgroundColor: colors.surface,
  },
});
