/**
 * Wallet header (CTZ-02 task 11): compact RwandaMark, screen title, persona initials, the
 * "Demo persona" pill and an overflow menu with "Switch persona" (ends the session →
 * `session.ended` → persona list). EN/RW switcher stays visible (AppHeader default).
 */
import {
  AppHeader,
  AppText,
  Button,
  IconButton,
  RwandaMark,
  Sheet,
  colors,
  initialsOf,
  minTouchTarget,
  radii,
  spacing,
  useTx,
} from "@laif/ui-native";
import { useRouter } from "expo-router";
import { useState } from "react";
import { StyleSheet, View } from "react-native";

import { usePersona } from "../providers.tsx";
import { HREFS } from "../state/access.ts";
import { useWalletActions } from "../state/useWalletActions.ts";

export type WalletHeaderProps = { title: string; onBack?: () => void };

export function WalletHeader({ title, onBack }: WalletHeaderProps) {
  const t = useTx();
  const persona = usePersona();
  const router = useRouter();
  const { endSession } = useWalletActions();
  const [menuOpen, setMenuOpen] = useState(false);
  const name = persona?.displayName ?? "";

  const switchPersona = async () => {
    setMenuOpen(false);
    router.replace(HREFS.persona);
    await endSession();
  };

  return (
    <View testID="wallet-header">
      <View style={styles.brandRow}>
        <RwandaMark compact />
        <View style={styles.personaRow}>
          <View
            style={styles.pill}
            accessible
            accessibilityLabel={t("citizen:onboarding.header.signedInAs", { name })}
          >
            <View style={styles.avatar}>
              <AppText variant="caption" weight="semibold" colorValue={colors.onPrimary} dense>
                {initialsOf(name)}
              </AppText>
            </View>
            <AppText variant="caption" mono caps dense color="primaryDark">
              {t("citizen:onboarding.header.demoPill")}
            </AppText>
          </View>
          <IconButton
            icon="more"
            label={t("citizen:onboarding.header.menu")}
            onPress={() => setMenuOpen(true)}
            testID="wallet-menu"
          />
        </View>
      </View>
      <AppHeader title={title} {...(onBack === undefined ? {} : { onBack })} />
      <Sheet
        visible={menuOpen}
        onClose={() => setMenuOpen(false)}
        title={t("citizen:onboarding.header.menuTitle")}
        description={t("citizen:onboarding.header.signedInAs", { name })}
        testID="wallet-menu-sheet"
      >
        <Button
          variant="secondary"
          icon="people"
          fullWidth
          accessibilityHint={t("citizen:onboarding.header.switchPersonaHint")}
          onPress={switchPersona}
          testID="switch-persona"
        >
          {t("citizen:onboarding.header.switchPersona")}
        </Button>
      </Sheet>
    </View>
  );
}

const styles = StyleSheet.create({
  brandRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    flexWrap: "wrap",
    gap: spacing.sm,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.sm,
  },
  personaRow: { flexDirection: "row", alignItems: "center", gap: spacing.xs },
  pill: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.xs,
    minHeight: minTouchTarget,
    paddingHorizontal: spacing.sm,
    borderRadius: radii.pill,
    backgroundColor: colors.primarySoft,
  },
  avatar: {
    width: 28,
    height: 28,
    borderRadius: radii.pill,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.primary,
  },
});
