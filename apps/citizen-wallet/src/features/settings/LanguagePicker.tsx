/**
 * Language (CTZ-08 task 2): a radio list with each language in its OWN name ("English",
 * "Ikinyarwanda"). It drives the same FND-04 preference as the header `LanguageSwitcher`
 * (`useLanguage`, stored as `laif.citizen.language`): the whole app re-renders at once, without a
 * restart and without internet; dates, numbers and on-screen validation messages follow.
 */
import { useLanguage, type Language } from "@laif/i18n";
import { AppText, RadioCardGroup, spacing, useTx } from "@laif/ui-native";
import { StyleSheet, View } from "react-native";

export function LanguagePicker({
  value,
  onChange,
  disabled = false,
}: {
  value: Language;
  onChange: (language: Language) => void;
  disabled?: boolean;
}) {
  const t = useTx();
  const { languages } = useLanguage();
  return (
    <View style={styles.root} testID="language-picker">
      <RadioCardGroup<Language>
        legend={t("citizen:accessibility.language.title")}
        options={languages.map((lng) => ({
          value: lng,
          label: t(`citizen:accessibility.language.names.${lng}`),
          ...(disabled ? { disabled: true } : {}),
        }))}
        value={value}
        onChange={(next) => {
          if (next !== value) onChange(next);
        }}
        testID="language-options"
      />
      <AppText variant="caption" color="muted">
        {t("citizen:accessibility.language.hint")}
      </AppText>
    </View>
  );
}

const styles = StyleSheet.create({ root: { gap: spacing.sm } });
