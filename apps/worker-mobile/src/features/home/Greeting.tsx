/**
 * Greeting (HWM-03): mono micro-label demo date in Africa/Kigali ("WEDNESDAY, 14 OCTOBER"),
 * "Good morning, {name}" by the Kigali hour of the demo clock, and the signed-in facility.
 * Weekday / month names come from the active catalogue, so EN⇄RW switch instantly.
 */
import { kigaliPartsManual } from "@laif/i18n";
import { AppText, MicroLabel, spacing, useTx, type TranslationKey } from "@laif/ui-native";
import { StyleSheet, View } from "react-native";

import { useSession } from "../../session/useSession.ts";

export type GreetingPeriod = "morning" | "afternoon" | "evening";

/** Kigali hour < 12 → morning, < 17 → afternoon, else evening. */
export function greetingPeriod(hour: number): GreetingPeriod {
  if (hour < 12) return "morning";
  if (hour < 17) return "afternoon";
  return "evening";
}

export function Greeting({ nowIso }: { nowIso: string | undefined }) {
  const t = useTx();
  const { session } = useSession();
  const parts = nowIso === undefined ? null : kigaliPartsManual(Date.parse(nowIso));
  const name = session?.persona.displayName ?? "";
  const facility =
    session === null ? "" : t(`demo:entity.facility.${session.facilityId}` as TranslationKey);
  return (
    <View testID="home-greeting" style={styles.root}>
      {parts === null ? null : (
        <MicroLabel testID="home-date">
          {t("worker:home.dateLabel", {
            weekday: t(`common:weekdays.long.${parts.weekday}` as TranslationKey),
            day: parts.day,
            month: t(`common:months.long.${parts.month}` as TranslationKey),
          }).toLocaleUpperCase()}
        </MicroLabel>
      )}
      <AppText variant="title" heading weight="bold" accessibilityRole="header">
        {t(`worker:home.greeting.${greetingPeriod(parts?.hour ?? 8)}`, { name })}
      </AppText>
      <AppText color="muted" testID="home-facility">
        {facility}
      </AppText>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { gap: spacing.xxs },
});
