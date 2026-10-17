/**
 * Submit result (HWM-06 task 5): big check icon and a title bound to the LIVE sync state of the
 * screening — "Saved on this device" + "Will sync when a connection is available" while the
 * `screening.submit` op is pending, "Synced" with the server event time once acknowledged.
 * The change is announced (`accessibilityLiveRegion="polite"` + VoiceOver announcement).
 * Actions: "Back to today", "View screening".
 */
import { formatTime, useLanguage } from "@laif/i18n";
import {
  announce,
  AppText,
  Button,
  colors,
  Icon,
  radii,
  spacing,
  SyncStatusPill,
  useTx,
} from "@laif/ui-native";
import { useEffect, useRef } from "react";
import { StyleSheet, View } from "react-native";

import type { ScreeningSyncView } from "../../data/screenings.ts";

export type SubmitSuccessProps = {
  /** Live sync view (`useScreeningSync`); null while loading (treated as pending). */
  sync: ScreeningSyncView | null;
  onBackToToday: () => void;
  onView: () => void;
};

type Phase = "pending" | "syncing" | "synced";

export function SubmitSuccess({ sync, onBackToToday, onView }: SubmitSuccessProps) {
  const t = useTx();
  const { language } = useLanguage();
  const phase: Phase =
    sync?.state === "synced" && sync.serverConfirmed
      ? "synced"
      : sync?.state === "syncing"
        ? "syncing"
        : "pending";
  const title = t(`worker:review.success.title.${phase}`);
  const detail =
    phase === "synced"
      ? sync?.syncedAt
        ? t("worker:review.success.syncedAt", { time: formatTime(sync.syncedAt, language) })
        : null
      : phase === "syncing"
        ? t("worker:review.success.sending")
        : t("worker:review.willSync");

  const announced = useRef<Phase | null>(null);
  useEffect(() => {
    if (announced.current !== null && announced.current !== phase) announce(title);
    announced.current = phase;
  }, [phase, title]);

  return (
    <View style={styles.wrap} testID="submit-success">
      <View style={styles.icon}>
        <Icon name="check" size={40} color={colors.positive} strokeWidth={2.4} />
      </View>
      <View
        style={styles.text}
        accessibilityLiveRegion="polite"
        aria-live="polite"
        testID={`submit-success-status-${phase}`}
      >
        <AppText variant="title" align="center" testID="submit-success-title">
          {title}
        </AppText>
        {detail === null ? null : (
          <AppText align="center" color="muted" testID="submit-success-detail">
            {detail}
          </AppText>
        )}
      </View>
      {sync !== null && sync.state !== "saved_locally" && sync.state !== "synced" ? (
        <SyncStatusPill state={sync.state} testID="submit-success-pill" />
      ) : null}
      <View style={styles.actions}>
        <Button fullWidth icon="home" testID="success-back-today" onPress={onBackToToday}>
          {t("worker:review.success.backToToday")}
        </Button>
        <Button fullWidth variant="secondary" testID="success-view" onPress={onView}>
          {t("worker:review.success.view")}
        </Button>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { alignItems: "center", gap: spacing.lg, paddingVertical: spacing.xl },
  icon: {
    width: 80,
    height: 80,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: radii.pill,
    backgroundColor: colors.positiveSoft,
  },
  text: { gap: spacing.xs, alignItems: "center" },
  actions: { alignSelf: "stretch", gap: spacing.sm },
});
