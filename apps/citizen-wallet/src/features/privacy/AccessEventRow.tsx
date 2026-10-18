/**
 * One access-history row (CTZ-07 task 4): initials avatar, the action in plain words ("Looked at
 * your record"), who — "You" or "Nurse reviewer (synthetic) · Kigali Demo Health Centre" (role and
 * facility only, never a staff name or note) — the purpose and the Kigali time, plus a mono chip
 * `VIEWED` / `UPDATED` / `YOU`.
 */
import type { CitizenAccessEvent } from "@laif/contracts";
import { formatDateTime, useLanguage } from "@laif/i18n";
import { AppText, initialsOf, radii, spacing, useTx, type Palette } from "@laif/ui-native";
import { StyleSheet, View } from "react-native";

import { actionKeyOf, actorText, isOwnEvent, purposeKeyOf } from "./copy.ts";
import { useThemedStyles } from "../../theme/useThemedStyles.ts";

export type AccessEventRowProps = {
  event: CitizenAccessEvent;
  /** The signed-in persona (own events show "You"). */
  personaId: string | null;
  /** Signed-in persona's name (initials of own rows). */
  ownName: string;
  /** Represented patient's name (purpose line of a representative's own views). */
  patientName: string;
};

export function AccessEventRow({ event, personaId, ownName, patientName }: AccessEventRowProps) {
  const styles = useThemedStyles(makeStyles);
  const t = useTx();
  const { language } = useLanguage();
  const own = isOwnEvent(event, personaId);
  const who = actorText(t, event, personaId);
  const what = t(actionKeyOf(event.action));
  const why = t(purposeKeyOf(event.purpose), { name: patientName });
  const when = formatDateTime(event.occurredAt, language);
  const chip = own
    ? t("citizen:privacy.access.chip.you")
    : event.action === "record_updated"
      ? t("citizen:privacy.access.chip.updated")
      : t("citizen:privacy.access.chip.viewed");
  // Staff: initials of the role ("Nurse reviewer" → "NR"); own rows: the persona's initials.
  const avatar = initialsOf(own ? ownName : (who.split(/[(·]/u)[0] ?? who));

  return (
    <View
      style={styles.row}
      accessible
      accessibilityLabel={`${what}. ${who}. ${why}. ${when}`}
      testID={`access-event-${event.id}`}
    >
      <View style={[styles.avatar, own ? styles.avatarOwn : null]} importantForAccessibility="no">
        <AppText variant="caption" weight="semibold" color={own ? "primary" : "muted"}>
          {avatar}
        </AppText>
      </View>
      <View style={styles.body}>
        <AppText weight="semibold" testID="access-row-action">
          {what}
        </AppText>
        <AppText variant="caption" color="muted" testID="access-row-actor">
          {who}
        </AppText>
        <AppText variant="caption" color="subtle" testID="access-row-time">
          {`${when} · ${why}`}
        </AppText>
      </View>
      <View style={[styles.chip, own ? styles.chipOwn : null]}>
        <AppText variant="micro" color={own ? "primary" : "muted"} testID="access-row-chip">
          {chip}
        </AppText>
      </View>
    </View>
  );
}

const makeStyles = (c: Palette) =>
  StyleSheet.create({
    row: {
      flexDirection: "row",
      alignItems: "center",
      gap: spacing.md,
      minHeight: 56,
      paddingVertical: spacing.sm,
    },
    avatar: {
      width: 40,
      height: 40,
      borderRadius: 20,
      alignItems: "center",
      justifyContent: "center",
      backgroundColor: c.background,
      borderWidth: 1,
      borderColor: c.border,
    },
    avatarOwn: { backgroundColor: c.primarySoft, borderColor: c.primarySoft },
    body: { flex: 1, gap: spacing.xxs },
    chip: {
      paddingHorizontal: spacing.sm,
      paddingVertical: spacing.xxs,
      borderRadius: radii.sm,
      borderWidth: 1,
      borderColor: c.border,
    },
    chipOwn: { borderColor: c.primary },
  });
