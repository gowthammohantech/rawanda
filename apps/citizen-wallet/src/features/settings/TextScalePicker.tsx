/**
 * Text size (CTZ-08 task 3): Standard / Large / Larger / Largest = 1.0 / 1.15 / 1.3 / 1.5, on top
 * of the phone's own text size. A live preview card shows a SAMPLE result card (made-up text,
 * never the citizen's data) at the chosen size.
 */
import {
  AppText,
  Card,
  RadioCardGroup,
  StatusChip,
  TEXT_SCALES,
  spacing,
  useTx,
  type TextScale,
  type TranslationKey,
} from "@laif/ui-native";
import { StyleSheet, View } from "react-native";

const LABEL_KEYS: Record<TextScale, TranslationKey> = {
  1: "citizen:accessibility.scale.standard",
  1.15: "citizen:accessibility.scale.large",
  1.3: "citizen:accessibility.scale.larger",
  1.5: "citizen:accessibility.scale.largest",
};

const valueOf = (scale: TextScale) => String(scale);

export function TextScalePicker({
  value,
  onChange,
  disabled = false,
}: {
  value: TextScale;
  onChange: (scale: TextScale) => void;
  disabled?: boolean;
}) {
  const t = useTx();
  return (
    <View style={styles.root} testID="text-scale-picker">
      <RadioCardGroup
        legend={t("citizen:accessibility.textSize")}
        options={TEXT_SCALES.map((scale) => ({
          value: valueOf(scale),
          label: t(LABEL_KEYS[scale]),
          ...(disabled ? { disabled: true } : {}),
        }))}
        value={valueOf(value)}
        onChange={(next) => {
          const scale = TEXT_SCALES.find((s) => valueOf(s) === next);
          if (scale !== undefined && scale !== value) onChange(scale);
        }}
        testID="text-scale-options"
      />
      <AppText variant="caption" color="muted">
        {t("citizen:accessibility.textSizeHint")}
      </AppText>
      <Card
        eyebrow={t("citizen:accessibility.preview.eyebrow")}
        title={t("citizen:accessibility.preview.title")}
        testID="text-scale-preview"
      >
        <StatusChip tone="positive">{t("citizen:accessibility.preview.chip")}</StatusChip>
        <AppText testID="text-scale-preview-body">
          {t("citizen:accessibility.preview.body")}
        </AppText>
      </Card>
    </View>
  );
}

const styles = StyleSheet.create({ root: { gap: spacing.md } });
