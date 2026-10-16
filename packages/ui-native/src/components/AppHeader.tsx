import type { ReactNode } from "react";
import { StyleSheet, View } from "react-native";

import { useTx } from "../i18n.ts";
import { colors, spacing } from "../tokens.ts";
import { AppText } from "./AppText.tsx";
import { IconButton } from "./IconButton.tsx";
import { LanguageSwitcher } from "./LanguageSwitcher.tsx";

export type AppHeaderProps = {
  /** Translated screen title (announced as a header). */
  title: string;
  subtitle?: string;
  /** Shows a back button ("Back") calling this. */
  onBack?: () => void;
  /** Extra right-side actions (IconButtons, NetworkBadge, avatar). */
  right?: ReactNode;
  /** The EN/RW switcher is shown by default (phases README "always visible"). */
  showLanguageSwitcher?: boolean;
};

/** Screen header: back, title/subtitle, right actions incl. `LanguageSwitcher`. */
export function AppHeader({
  title,
  subtitle,
  onBack,
  right,
  showLanguageSwitcher = true,
}: AppHeaderProps) {
  const t = useTx();
  return (
    <View testID="app-header" style={styles.header}>
      {onBack === undefined ? null : (
        <IconButton
          icon="chevron-left"
          labelKey="common:actions.back"
          accessibilityHint={t("common:a11y.backHint")}
          onPress={onBack}
        />
      )}
      <View style={styles.titles}>
        <AppText variant="title" accessibilityRole="header" numberOfLines={2}>
          {title}
        </AppText>
        {subtitle === undefined ? null : (
          <AppText variant="caption" color="muted" numberOfLines={2}>
            {subtitle}
          </AppText>
        )}
      </View>
      <View style={styles.right}>
        {right ?? null}
        {showLanguageSwitcher ? <LanguageSwitcher /> : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
    backgroundColor: colors.surface,
    borderBottomWidth: 1,
    borderBottomColor: colors.borderSoft,
  },
  titles: { flex: 1, gap: spacing.xxs },
  right: { flexDirection: "row", alignItems: "center", gap: spacing.xs },
});
