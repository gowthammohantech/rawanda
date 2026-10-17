/**
 * Autosave status (HWM-05): "Saving…" / "Draft saved on this device · 10:42" (Kigali time). It
 * always says "on this device" — identical online and offline (drafts are never synced).
 */
import { formatTime, useLanguage } from "@laif/i18n";
import { AppText, colors, Icon, spacing, useTx } from "@laif/ui-native";
import { StyleSheet, View } from "react-native";

import type { AutosaveStatus } from "./useDraftAutosave.ts";

export function DraftStatusLine({
  status,
  savedAt,
}: {
  status: AutosaveStatus;
  savedAt: string | null;
}) {
  const t = useTx();
  const { language } = useLanguage();
  const text =
    status === "saving"
      ? t("worker:screening.saving")
      : status === "error"
        ? t("worker:screening.saveFailed")
        : savedAt === null
          ? t("worker:screening.notSavedYet")
          : t("worker:screening.draftSaved", { time: formatTime(savedAt, language) });
  return (
    <View style={styles.row} accessibilityLiveRegion="polite" aria-live="polite">
      <Icon
        name={status === "error" ? "alert" : status === "saving" ? "clock" : "check"}
        size={14}
        color={status === "error" ? colors.danger : colors.muted}
      />
      <AppText
        variant="caption"
        testID="draft-status"
        {...(status === "error" ? { colorValue: colors.danger } : { color: "muted" as const })}
        style={styles.flex}
      >
        {text}
      </AppText>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: "row", alignItems: "center", gap: spacing.xs },
  flex: { flex: 1 },
});
