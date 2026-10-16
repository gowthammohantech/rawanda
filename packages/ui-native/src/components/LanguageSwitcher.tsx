import { useLanguage } from "@laif/i18n";
import { Pressable, StyleSheet, View } from "react-native";

import { a11yState, touchTarget } from "../a11y.ts";
import { useTx } from "../i18n.ts";
import { colors, radii, spacing } from "../tokens.ts";
import { AppText } from "./AppText.tsx";

export type LanguageSwitcherProps = { testID?: string };

/** EN / RW segmented control; persists via `useLanguage().setLanguage` (FND-04 storage). */
export function LanguageSwitcher({ testID }: LanguageSwitcherProps) {
  const t = useTx();
  const { language, setLanguage, languages } = useLanguage();
  return (
    <View
      testID={testID ?? "language-switcher"}
      accessibilityRole="radiogroup"
      accessibilityLabel={t("common:language.label")}
      style={styles.group}
    >
      {languages.map((lng) => {
        const active = lng === language;
        return (
          <Pressable
            key={lng}
            accessibilityRole="radio"
            accessibilityLabel={t(`common:languageName.${lng}`)}
            accessibilityHint={t("common:a11y.languageHint")}
            {...a11yState({ selected: active, checked: active })}
            onPress={() => {
              if (!active) void setLanguage(lng);
            }}
            style={[touchTarget, styles.option, active ? styles.active : null]}
          >
            <AppText
              mono
              weight="medium"
              variant="caption"
              dense
              colorValue={active ? colors.onPrimary : colors.muted}
            >
              {lng.toUpperCase()}
            </AppText>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  group: {
    flexDirection: "row",
    alignItems: "center",
    alignSelf: "flex-start",
    gap: spacing.xxs,
    padding: spacing.xxs,
    borderWidth: 1,
    borderColor: colors.borderSoft,
    borderRadius: radii.pill,
    backgroundColor: colors.surface,
  },
  option: {
    alignItems: "center",
    justifyContent: "center",
    borderRadius: radii.pill,
    paddingHorizontal: spacing.sm,
  },
  active: { backgroundColor: colors.primary },
});
