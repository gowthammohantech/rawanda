/**
 * The two explicit decisions (HWM-09 task 7): "Re-apply my update on the latest version" —
 * disabled with the reason when the latest state makes it invalid — and "Keep the latest and
 * withdraw mine". Each opens a confirmation; nothing changes before it is confirmed.
 */
import type { ConflictResolution } from "@laif/domain";
import { AppText, Button, InfoCallout, MicroLabel, spacing, useTx } from "@laif/ui-native";
import { StyleSheet, View } from "react-native";

import type { ReapplyBlock } from "../../sync/resolve.ts";

export const REAPPLY_BLOCK_KEYS = {
  no_latest: "worker:sync.conflict.blocked.no_latest",
  reassigned: "worker:sync.conflict.blocked.reassigned",
  completed: "worker:sync.conflict.blocked.completed",
  outcome_recorded: "worker:sync.conflict.blocked.outcome_recorded",
} as const satisfies Record<ReapplyBlock, string>;

export type ResolutionChoiceProps = {
  reapplyBlock: ReapplyBlock | null;
  onChoose: (resolution: ConflictResolution) => void;
  disabled?: boolean;
};

export function ResolutionChoice({
  reapplyBlock,
  onChoose,
  disabled = false,
}: ResolutionChoiceProps) {
  const t = useTx();
  return (
    <View style={styles.wrap} testID="resolution-choice">
      <MicroLabel heading>{t("worker:sync.conflict.choose")}</MicroLabel>
      <View style={styles.choice}>
        <Button
          testID="choose-reapply"
          icon="refresh"
          fullWidth
          disabled={disabled || reapplyBlock !== null}
          accessibilityHint={
            reapplyBlock === null
              ? t("worker:sync.conflict.reapplyHint")
              : t(REAPPLY_BLOCK_KEYS[reapplyBlock])
          }
          onPress={() => onChoose("reapply_on_latest")}
        >
          {t("worker:sync.conflict.reapply")}
        </Button>
        {reapplyBlock === null ? (
          <AppText variant="caption" color="muted">
            {t("worker:sync.conflict.reapplyHint")}
          </AppText>
        ) : (
          <InfoCallout icon="lock" testID="reapply-blocked-reason">
            {t(REAPPLY_BLOCK_KEYS[reapplyBlock])}
          </InfoCallout>
        )}
      </View>
      <View style={styles.choice}>
        <Button
          testID="choose-keep-latest"
          variant="secondary"
          icon="check"
          fullWidth
          disabled={disabled}
          accessibilityHint={t("worker:sync.conflict.keepLatestHint")}
          onPress={() => onChoose("keep_latest")}
        >
          {t("worker:sync.conflict.keepLatest")}
        </Button>
        <AppText variant="caption" color="muted">
          {t("worker:sync.conflict.keepLatestHint")}
        </AppText>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: spacing.md },
  choice: { gap: spacing.xs },
});
