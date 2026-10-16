import { StyleSheet, View } from "react-native";

import { useTx } from "../i18n.ts";
import { Icon } from "../icons/Icon.tsx";
import { radii, spacing } from "../tokens.ts";
import { AppText } from "./AppText.tsx";
import { TONE_COLORS } from "./tone.ts";

export type OfflineBannerProps = {
  /** Already-formatted Kigali time of the last successful sync. */
  lastSyncedLabel?: string;
};

/** "You are offline. Changes are saved on this device." — polite live region. */
export function OfflineBanner({ lastSyncedLabel }: OfflineBannerProps) {
  const t = useTx();
  const palette = TONE_COLORS.warning;
  return (
    <View
      testID="offline-banner"
      accessible
      accessibilityRole="alert"
      accessibilityLiveRegion="polite"
      aria-live="polite"
      style={[styles.banner, { backgroundColor: palette.bg, borderColor: palette.border }]}
    >
      <Icon name="wifi-off" size={16} color={palette.fg} />
      <View style={styles.text}>
        <AppText variant="caption" weight="semibold" colorValue={palette.fg}>
          {t("common:state.offline")}
        </AppText>
        {lastSyncedLabel === undefined ? null : (
          <AppText variant="caption" colorValue={palette.fg}>
            {t("shell:offline.lastSynced", { time: lastSyncedLabel })}
          </AppText>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  banner: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    marginHorizontal: spacing.lg,
    marginTop: spacing.sm,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderWidth: 1,
    borderRadius: radii.md,
  },
  text: { flex: 1 },
});
