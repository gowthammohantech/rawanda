/**
 * Worker header (HWM-01 task 9): screen title, the signed-in facility, NetworkBadge and the
 * avatar-initials button that opens Settings. Wraps the ui-native AppHeader (EN/RW switcher
 * included); rendered by `Screen` under the always-visible DemoBanner, inside the safe area.
 */
import {
  AppHeader as KitAppHeader,
  AppText,
  colors,
  initialsOf,
  radii,
  touchTarget,
  useTx,
  type TranslationKey,
} from "@laif/ui-native";
import { useRouter } from "expo-router";
import type { ReactNode } from "react";
import { Pressable, StyleSheet } from "react-native";

import { useSession } from "../session/useSession.ts";
import { NetworkBadge } from "./NetworkBadge.tsx";

export type WorkerHeaderProps = {
  title: string;
  onBack?: () => void;
  /** The avatar menu is hidden on Settings itself. */
  showAvatar?: boolean;
  /** Screen actions left of the network badge (e.g. the draft options menu, HWM-05). */
  actions?: ReactNode;
};

export function AppHeader({ title, onBack, showAvatar = true, actions }: WorkerHeaderProps) {
  const t = useTx();
  const router = useRouter();
  const { session } = useSession();
  const facility =
    session === null
      ? undefined
      : t(`demo:entity.facility.${session.facilityId}` as TranslationKey);
  return (
    <KitAppHeader
      title={title}
      {...(facility === undefined ? {} : { subtitle: facility })}
      {...(onBack === undefined ? {} : { onBack })}
      right={
        <>
          {actions ?? null}
          <NetworkBadge />
          {showAvatar && session !== null ? (
            <Pressable
              testID="avatar-button"
              accessibilityRole="button"
              accessibilityLabel={t("worker:nav.openSettings", {
                name: session.persona.displayName,
              })}
              accessibilityHint={t("worker:nav.openSettingsHint")}
              onPress={() => router.push("/settings")}
              style={[touchTarget, styles.avatar]}
            >
              <AppText weight="semibold" colorValue={colors.primaryDark}>
                {initialsOf(session.persona.displayName)}
              </AppText>
            </Pressable>
          ) : null}
        </>
      }
    />
  );
}

const styles = StyleSheet.create({
  avatar: {
    alignItems: "center",
    justifyContent: "center",
    borderRadius: radii.pill,
    backgroundColor: colors.primarySoft,
    borderWidth: 1,
    borderColor: colors.primary,
  },
});
