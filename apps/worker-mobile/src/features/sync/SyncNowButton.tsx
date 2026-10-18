/**
 * Sync now (HWM-09 task 3): busy (spinner, disabled) while a run is active; taps that still get
 * through during a run join it (`useSyncNow`). Offline: disabled with the reason shown.
 */
import { Button, InfoCallout, spacing, useTx } from "@laif/ui-native";
import { StyleSheet, View } from "react-native";

export type SyncNowButtonProps = {
  offline: boolean;
  running: boolean;
  onPress: () => void;
};

export function SyncNowButton({ offline, running, onPress }: SyncNowButtonProps) {
  const t = useTx();
  return (
    <View style={styles.wrap}>
      <Button
        testID="sync-now"
        icon="sync"
        fullWidth
        loading={running}
        disabled={offline}
        accessibilityHint={offline ? t("worker:sync.offlineReason") : t("worker:sync.syncNowHint")}
        // Not a promise on purpose: the run state comes from the triggers (shared with
        // automatic runs), and a tap during a run must reach the handler to join it.
        onPress={() => onPress()}
      >
        {running ? t("worker:sync.syncing") : t("worker:sync.syncNow")}
      </Button>
      {offline ? (
        <InfoCallout icon="info" testID="sync-now-offline-reason">
          {t("worker:sync.offlineReason")}
        </InfoCallout>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: spacing.sm },
});
