/**
 * One timeline row (CTZ-06 task 3): mono rail date (`OCT 13`), the state marker on a vertical
 * rail line, title / body / neutral note / provenance and the state chip (`DONE`, `WAITING`,
 * `UPDATED`, `CANCELLED`). Info rows (reminders, "you read your next step") have no chip — a
 * small dot and muted text — so they never look like completed care. The screen-reader label
 * always starts with the state ("DONE. Check recorded. …"). Tappable when the item links
 * somewhere or has a change to show (≥ 44pt).
 */
import { formatDate, useLanguage } from "@laif/i18n";
import {
  AppText,
  Icon,
  StatusChip,
  spacing,
  touchTarget,
  useTx,
  type TranslationValues,
  usePalette,
  type Palette,
} from "@laif/ui-native";
import { Pressable, StyleSheet, View } from "react-native";

import type { TimelineItem, TimelineParam } from "./buildCitizenTimeline.ts";
import { ProvenanceLine, provenanceText } from "./ProvenanceLine.tsx";
import { railDateLabel } from "./timelineDates.ts";
import { STATE_SPECS, TimelineStateIcon } from "./TimelineStateIcon.tsx";
import { useThemedStyles } from "../../theme/useThemedStyles.ts";

type Tx = ReturnType<typeof useTx>;
type Language = Parameters<typeof formatDate>[1];

function resolveParams(
  t: Tx,
  params: Record<string, TimelineParam>,
  language: Language,
): TranslationValues {
  const out: TranslationValues = {};
  for (const [name, param] of Object.entries(params)) {
    out[name] =
      param.type === "text"
        ? param.value
        : param.type === "date"
          ? formatDate(param.iso, language)
          : t(param.key);
  }
  return out;
}

/** Visible texts of a row in the current language (also used for the a11y label). */
export function rowTexts(t: Tx, entry: TimelineItem, language: Language) {
  const values = resolveParams(t, entry.params, language);
  const spec = STATE_SPECS[entry.state];
  return {
    state: t(spec.a11yKey),
    chip: spec.chipKey === null ? null : t(spec.chipKey),
    title: t(entry.titleKey, values),
    body: entry.bodyKey === null ? null : t(entry.bodyKey, values),
    note: entry.noteKey === null ? null : t(entry.noteKey),
    provenance: entry.provenance === null ? null : provenanceText(t, entry.provenance, language),
    date: formatDate(entry.occurredAt, language),
  };
}

export type TimelineItemRowProps = {
  item: TimelineItem;
  /** Draw the rail line below the marker (false on the last row of a section). */
  railBelow: boolean;
  onPress: ((item: TimelineItem) => void) | null;
};

export function TimelineItemRow({ item, railBelow, onPress }: TimelineItemRowProps) {
  const palette = usePalette();
  const styles = useThemedStyles(makeStyles);
  const t = useTx();
  const { language } = useLanguage();
  const texts = rowTexts(t, item, language);
  const spec = STATE_SPECS[item.state];
  const isInfo = item.state === "info";
  // CTZ-09: a state is read as "Status: Done" (citizen:a11y.status); info rows stay "Note".
  const label = [
    isInfo ? texts.state : t("citizen:a11y.status", { status: texts.state }),
    texts.title,
    texts.body,
    texts.note,
    texts.provenance,
    texts.date,
  ]
    .filter((x): x is string => x !== null)
    .join(". ");

  const content = (
    <>
      <View style={styles.dateCol}>
        <AppText variant="micro" color="muted" dense>
          {railDateLabel(t, item.occurredAt)}
        </AppText>
      </View>
      <View style={styles.railCol}>
        <TimelineStateIcon state={item.state} />
        {railBelow ? <View style={styles.railLine} /> : null}
      </View>
      <View style={styles.body}>
        <AppText
          weight={isInfo ? "regular" : "semibold"}
          color={isInfo ? "muted" : "ink"}
          variant={isInfo ? "caption" : "body"}
        >
          {texts.title}
        </AppText>
        {texts.body === null ? null : (
          <AppText variant="caption" color="muted">
            {texts.body}
          </AppText>
        )}
        {texts.note === null ? null : (
          <AppText variant="caption" color="muted" testID="timeline-date-passed">
            {texts.note}
          </AppText>
        )}
        {item.provenance === null ? null : <ProvenanceLine provenance={item.provenance} />}
        {texts.chip === null ? null : (
          <StatusChip tone={spec.tone} icon={spec.chipIcon} testID={`timeline-chip-${item.state}`}>
            {texts.chip}
          </StatusChip>
        )}
      </View>
      {onPress === null ? null : <Icon name="chevron" size={18} color={palette.muted} />}
    </>
  );

  if (onPress === null) {
    return (
      <View
        accessible
        accessibilityRole="text"
        accessibilityLabel={label}
        style={styles.row}
        testID={`timeline-item-${item.id}`}
      >
        {content}
      </View>
    );
  }
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityHint={t(
        item.change === null ? "citizen:timeline.openHint" : "citizen:timeline.changeHint",
      )}
      onPress={() => onPress(item)}
      style={({ pressed }) => [styles.row, touchTarget, pressed ? styles.pressed : null]}
      testID={`timeline-item-${item.id}`}
    >
      {content}
    </Pressable>
  );
}

const makeStyles = (c: Palette) =>
  StyleSheet.create({
    row: {
      flexDirection: "row",
      alignItems: "stretch",
      gap: spacing.sm,
      paddingHorizontal: spacing.xs,
    },
    pressed: { backgroundColor: c.background },
    dateCol: { width: 52, paddingTop: spacing.xs },
    railCol: { width: 24, alignItems: "center" },
    railLine: { flex: 1, width: 2, marginTop: spacing.xxs, backgroundColor: c.border },
    body: { flex: 1, gap: spacing.xxs, paddingBottom: spacing.lg, paddingTop: spacing.xxs },
  });
