import type { ReactNode } from "react";
import { StyleSheet, View } from "react-native";

import { useTx } from "../i18n.ts";
import { Icon } from "../icons/Icon.tsx";
import { colors, radii, spacing } from "../tokens.ts";
import { AppText } from "./AppText.tsx";
import { MicroLabel } from "./MicroLabel.tsx";

export type RoleBannerProps = {
  /** Synthetic persona name (already resolved). */
  personaName: string;
  /** Translated role label, e.g. `t('domain:role.community_health_worker')`. */
  roleLabel: string;
  /** Translated scope (facility / district). */
  scopeLabel?: string;
  /** Optional trailing action (e.g. a PersonaSwitcher). */
  action?: ReactNode;
};

/** Persona + scope + "Demo role switch — not authentication". */
export function RoleBanner({ personaName, roleLabel, scopeLabel, action }: RoleBannerProps) {
  const t = useTx();
  return (
    <View testID="role-banner" style={styles.banner}>
      <Icon name="user" size={16} color={colors.primaryDark} />
      <View style={styles.text}>
        <AppText variant="caption" weight="semibold">
          {personaName}
        </AppText>
        <AppText variant="caption" color="muted">
          {scopeLabel === undefined
            ? roleLabel
            : `${roleLabel} · ${t("shell:role.scope", { scope: scopeLabel })}`}
        </AppText>
        <MicroLabel>{t("demo:demoRoleSwitcher")}</MicroLabel>
      </View>
      {action ?? null}
    </View>
  );
}

const styles = StyleSheet.create({
  banner: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderWidth: 1,
    borderColor: colors.borderSoft,
    borderRadius: radii.md,
    backgroundColor: colors.primarySoft,
  },
  text: { flex: 1, gap: spacing.xxs },
});
