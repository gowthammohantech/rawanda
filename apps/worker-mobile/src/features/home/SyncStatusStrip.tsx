/**
 * Sync status strip (HWM-03 task 5): NetworkBadge + pending count + last successful sync, the
 * whole strip opens the Sync tab. Offline → "Working offline (simulated) · 3 saved on this
 * device"; online + pending → "3 waiting to sync"; conflicts → danger pill "1 needs your
 * decision". Icon + text throughout (never colour only).
 */
import { formatDateTime, useLanguage } from "@laif/i18n";
import {
  AppText,
  colors,
  Icon,
  radii,
  spacing,
  StatusChip,
  touchTarget,
  useTx,
} from "@laif/ui-native";
import { Pressable, StyleSheet, View } from "react-native";

import { NetworkBadge } from "../../components/NetworkBadge.tsx";

export type SyncStatusStripProps = {
  offline: boolean;
  pendingCount: number;
  conflicts: number;
  lastSyncedAt: string | null;
  onOpenSync: () => void;
};

export function SyncStatusStrip({
  offline,
  pendingCount,
  conflicts,
  lastSyncedAt,
  onOpenSync,
}: SyncStatusStripProps) {
  const t = useTx();
  const { language } = useLanguage();
  const primary = offline
    ? `${t("worker:home.strip.offline")} · ${t("worker:home.pending", { count: pendingCount })}`
    : pendingCount > 0
      ? t("worker:home.strip.waiting", { count: pendingCount })
      : t("worker:home.strip.allSynced");
  const lastSynced =
    lastSyncedAt === null
      ? t("worker:home.strip.neverSynced")
      : t("worker:home.strip.lastSynced", { time: formatDateTime(lastSyncedAt, language) });
  const conflictText =
    conflicts > 0 ? t("worker:home.strip.conflicts", { count: conflicts }) : null;
  const label = [primary, conflictText, lastSynced].filter((part) => part !== null).join(", ");
  return (
    <Pressable
      testID="sync-status-strip"
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityHint={t("worker:home.strip.openSync")}
      onPress={onOpenSync}
      style={({ pressed }) => [
        touchTarget,
        styles.strip,
        offline ? styles.offline : null,
        pressed ? styles.pressed : null,
      ]}
    >
      <View style={styles.top}>
        <NetworkBadge testID="sync-strip-network-badge" />
        <View style={styles.text}>
          <AppText weight="semibold" testID="sync-strip-primary">
            {primary}
          </AppText>
          <AppText variant="caption" color="muted" testID="sync-strip-last">
            {lastSynced}
          </AppText>
        </View>
        <Icon name="chevron" size={18} color={colors.muted} />
      </View>
      {conflictText === null ? null : (
        <StatusChip tone="danger" icon="alert" testID="sync-strip-conflicts">
          {conflictText}
        </StatusChip>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  strip: {
    gap: spacing.sm,
    padding: spacing.md,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radii.lg,
    backgroundColor: colors.surface,
  },
  offline: { backgroundColor: colors.warningSoft },
  pressed: { backgroundColor: colors.background },
  top: { flexDirection: "row", alignItems: "center", gap: spacing.md },
  text: { flex: 1, gap: spacing.xxs },
});
