/**
 * CONNECTION card (HWM-09 task 4): simulated online / offline with icon + text (never colour
 * alone), last successful sync (Kigali time), items waiting, a link to Network simulation and
 * the `SIMULATED SYNC SERVER` pill.
 */
import { formatDateTime, useLanguage } from "@laif/i18n";
import {
  AppText,
  Button,
  Card,
  colors,
  Icon,
  MicroLabel,
  spacing,
  StatusChip,
  useTx,
} from "@laif/ui-native";
import { StyleSheet, View } from "react-native";

export type ConnectionCardProps = {
  offline: boolean;
  lastSyncedAt: string | null;
  /** Waiting + needs decision. */
  pending: number;
  onOpenNetwork: () => void;
};

export function ConnectionCard({
  offline,
  lastSyncedAt,
  pending,
  onOpenNetwork,
}: ConnectionCardProps) {
  const t = useTx();
  const { language } = useLanguage();
  const state = offline ? t("worker:sync.connection.offline") : t("worker:sync.connection.online");
  return (
    <Card testID="connection-card">
      <View style={styles.head}>
        <MicroLabel>{t("worker:sync.connection.label")}</MicroLabel>
        <StatusChip tone="warning" icon="info" testID="sync-server-pill">
          {t("worker:sync.connection.pill")}
        </StatusChip>
      </View>
      <View style={styles.state} accessible accessibilityLabel={state} testID="connection-state">
        <Icon
          name={offline ? "wifi-off" : "sync"}
          size={20}
          color={offline ? colors.warning : colors.positive}
        />
        <AppText weight="semibold">{state}</AppText>
      </View>
      <AppText variant="caption" color="muted" testID="connection-last-sync">
        {lastSyncedAt === null
          ? t("worker:sync.connection.never")
          : t("worker:sync.connection.lastSync", {
              time: formatDateTime(lastSyncedAt, language),
            })}
      </AppText>
      <AppText variant="caption" color="muted" testID="connection-pending">
        {t("worker:sync.connection.pending", { count: pending })}
      </AppText>
      <View style={styles.link}>
        <Button
          variant="ghost"
          size="sm"
          icon="settings"
          testID="open-network-simulation-from-sync"
          onPress={onOpenNetwork}
        >
          {t("worker:sync.connection.networkSim")}
        </Button>
      </View>
    </Card>
  );
}

const styles = StyleSheet.create({
  head: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: spacing.sm,
    flexWrap: "wrap",
  },
  state: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
  link: { flexDirection: "row" },
});
