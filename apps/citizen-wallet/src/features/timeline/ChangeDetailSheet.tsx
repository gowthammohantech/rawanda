/**
 * "What changed" sheet (CTZ-06 task 5; T-06 citizen view of a correction): the changed field,
 * "Before" and "After" side by side (ref-images conflict-card pattern, both values always
 * shown), who updated it, when, and the reason (catalogue key only), then "Your earlier record
 * is kept. Nothing was deleted." Opening it records `citizen.change.viewed` (the caller passes
 * `onOpened`). Read-only — the wallet never edits a record.
 */
import type { AmendableScreeningField, AmendableValue, GlucoseContext } from "@laif/domain";
import { formatDateTime, formatNumber, useLanguage } from "@laif/i18n";
import {
  AppText,
  Button,
  InfoCallout,
  KeyValueList,
  MicroLabel,
  Sheet,
  radii,
  spacing,
  useTx,
  type TranslationKey,
  type Palette,
} from "@laif/ui-native";
import { useEffect, useRef } from "react";
import { StyleSheet, View } from "react-native";

import { GLUCOSE_CONTEXT_KEYS, reviewerOf } from "../health/copy.ts";
import type { TimelineChange } from "./buildCitizenTimeline.ts";
import { ProvenanceLine, reasonKeyOf } from "./ProvenanceLine.tsx";
import { useThemedStyles } from "../../theme/useThemedStyles.ts";

type Tx = ReturnType<typeof useTx>;
type Language = Parameters<typeof formatNumber>[1];

const isGlucoseContext = (value: unknown): value is GlucoseContext =>
  typeof value === "string" && value in GLUCOSE_CONTEXT_KEYS;

/** A stored amendment value in plain language (never a raw code). */
export function changeValueText(
  t: Tx,
  field: AmendableScreeningField,
  value: AmendableValue,
  language: Language,
): string {
  if (value === null || value === "") return t("citizen:timeline.change.empty");
  switch (field) {
    case "glucoseContext":
      return isGlucoseContext(value)
        ? t(GLUCOSE_CONTEXT_KEYS[value])
        : t("citizen:timeline.change.empty");
    case "measuredAt":
      return typeof value === "string" ? formatDateTime(value, language) : String(value);
    case "systolic":
    case "diastolic":
      return typeof value === "number"
        ? `${formatNumber(value, language, { maximumFractionDigits: 0 })} mmHg`
        : String(value);
    case "glucoseValue":
      return typeof value === "number"
        ? formatNumber(value, language, { maximumFractionDigits: 1 })
        : String(value);
    case "glucoseUnit":
      return String(value);
  }
}

export type ChangeDetailSheetProps = {
  change: TimelineChange | null;
  onClose: () => void;
  /** Called once per opened change (records `citizen.change.viewed`). */
  onOpened: (observationId: string) => void;
  onOpenResult: (observationId: string) => void;
};

export function ChangeDetailSheet({
  change,
  onClose,
  onOpened,
  onOpenResult,
}: ChangeDetailSheetProps) {
  const styles = useThemedStyles(makeStyles);
  const t = useTx();
  const { language } = useLanguage();

  // Once per opened change (not on every re-render / language switch).
  const logged = useRef<string | null>(null);
  const openedId = change === null ? null : `${change.observationId}:${change.amendedAt}`;
  useEffect(() => {
    if (change === null || openedId === null) {
      logged.current = null;
      return;
    }
    if (logged.current === openedId) return;
    logged.current = openedId;
    onOpened(change.observationId);
  }, [change, openedId, onOpened]);

  if (change === null) return null;
  const fieldLabel = t(`citizen:timeline.change.fields.${change.field}` as TranslationKey);
  const before = changeValueText(t, change.field, change.before, language);
  const after = changeValueText(t, change.field, change.after, language);
  const author = reviewerOf(change.amendedBy);

  return (
    <Sheet
      visible
      onClose={onClose}
      title={t("citizen:timeline.change.title")}
      description={t("citizen:timeline.change.description")}
      testID="change-detail-sheet"
      footer={
        <>
          <Button
            variant="secondary"
            icon="file"
            onPress={() => onOpenResult(change.observationId)}
            testID="change-open-result"
          >
            {t("citizen:timeline.change.openResult")}
          </Button>
          <Button variant="ghost" onPress={onClose} testID="change-close">
            {t("citizen:timeline.change.close")}
          </Button>
        </>
      }
    >
      <View style={styles.field}>
        <MicroLabel>{t("citizen:timeline.change.field")}</MicroLabel>
        <AppText weight="semibold" testID="change-field">
          {fieldLabel}
        </AppText>
      </View>
      <View style={styles.compare}>
        <View
          style={[styles.box, styles.before]}
          accessible
          accessibilityLabel={`${t("citizen:timeline.change.before")}: ${before}`}
          testID="change-before"
        >
          <MicroLabel>{t("citizen:timeline.change.before")}</MicroLabel>
          <AppText color="muted">{before}</AppText>
        </View>
        <View
          style={[styles.box, styles.after]}
          accessible
          accessibilityLabel={`${t("citizen:timeline.change.after")}: ${after}`}
          testID="change-after"
        >
          <MicroLabel>{t("citizen:timeline.change.after")}</MicroLabel>
          <AppText weight="semibold">{after}</AppText>
        </View>
      </View>
      <ProvenanceLine
        testID="change-provenance"
        provenance={{
          kind: "updated",
          personaId: change.amendedBy,
          at: change.amendedAt,
          reasonKey: change.reasonKey ?? "unknown",
        }}
      />
      <KeyValueList
        testID="change-details"
        items={[
          {
            id: "by",
            label: t("citizen:timeline.change.by"),
            value:
              author === null
                ? t("citizen:timeline.provenance.careTeam")
                : t("citizen:health.detail.reviewerValue", {
                    name: author.name,
                    role: t(author.roleKey),
                  }),
          },
          {
            id: "when",
            label: t("citizen:timeline.change.when"),
            value: formatDateTime(change.amendedAt, language),
          },
          {
            id: "reason",
            label: t("citizen:timeline.change.reason"),
            value: t(reasonKeyOf(change.reasonKey)),
          },
        ]}
      />
      <InfoCallout icon="shield" testID="change-kept">
        {t("citizen:timeline.change.kept")}
      </InfoCallout>
    </Sheet>
  );
}

const makeStyles = (c: Palette) =>
  StyleSheet.create({
    field: { gap: spacing.xxs },
    compare: { flexDirection: "row", gap: spacing.sm },
    box: {
      flex: 1,
      gap: spacing.xs,
      padding: spacing.md,
      borderRadius: radii.md,
      borderWidth: 1,
    },
    before: { borderColor: c.border, backgroundColor: c.background },
    after: { borderColor: c.info, backgroundColor: c.infoSoft },
  });
