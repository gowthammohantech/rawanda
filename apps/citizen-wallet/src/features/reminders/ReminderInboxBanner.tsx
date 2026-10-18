/**
 * In-app reminder inbox (CTZ-05 task 4), mounted in `(tabs)/_layout.tsx`: runs the simulated
 * delivery (`useReminderProcessor`: mount, app focus, demo-clock change) and, while a
 * `delivered_simulated` reminder is not yet marked as seen, shows "You have a reminder from your
 * care team" → opens the Reminders tab. Generic text only (no health details); hidden on the
 * Reminders tab itself, where the reminder is listed with "Got it".
 */
import { AppText, Icon, colors, radii, spacing, touchTarget, useTx } from "@laif/ui-native";
import { useRouter, useSegments } from "expo-router";
import { Pressable, StyleSheet, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { useConsent } from "../../data/queries.ts";
import { useActivePatient } from "../health/useResults.ts";
import { unacknowledged, useReminderProcessor, useReminders } from "./useReminders.ts";

export function ReminderInboxBanner() {
  const t = useTx();
  const router = useRouter();
  const segments = useSegments() as readonly string[];
  const activeId = useActivePatient()?.patientId ?? null;
  // CTZ-08: the tabs also host consent-free routes (Accessibility / Support) — no reminder read
  // (health data) unless consent is granted.
  const consent = useConsent(activeId);
  const patientId = consent.data?.state === "granted" ? activeId : null;
  useReminderProcessor(patientId);
  const reminders = useReminders(patientId);
  const waiting = unacknowledged(reminders.data);
  if (waiting.length === 0 || segments.includes("reminders")) return null;
  const label = t("citizen:reminders.inbox.banner");
  return (
    <SafeAreaView edges={["top", "left", "right"]} style={styles.safe}>
      <Pressable
        onPress={() => router.push("/reminders")}
        accessibilityRole="button"
        accessibilityLabel={label}
        accessibilityHint={t("citizen:reminders.inbox.open")}
        style={({ pressed }) => [styles.banner, touchTarget, pressed ? styles.pressed : null]}
        testID="reminder-inbox-banner"
      >
        <View style={styles.icon}>
          <Icon name="bell" size={18} color={colors.onPrimary} />
        </View>
        <AppText weight="semibold" style={styles.text}>
          {label}
        </AppText>
        <Icon name="chevron" size={18} color={colors.primaryDark} />
      </Pressable>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { backgroundColor: colors.primarySoft },
  banner: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: colors.borderSoft,
  },
  pressed: { opacity: 0.8 },
  icon: {
    width: 28,
    height: 28,
    borderRadius: radii.pill,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.primary,
  },
  text: { flex: 1 },
});
