/**
 * Stale-conflict notice (CTZ-04 task 4, T-05): the care team changed this step after it was
 * shown, so nothing was saved. The citizen reloads the latest version and reads it again.
 * CTZ-07 reuses it for correction requests with its own copy (`title` / `body` / `reloadLabel`).
 */
import { Button, InfoCallout, spacing, useTx } from "@laif/ui-native";
import { StyleSheet, View } from "react-native";

export type ConflictNoticeProps = {
  onReload: () => unknown;
  title?: string;
  body?: string;
  reloadLabel?: string;
};

export function ConflictNotice({ onReload, title, body, reloadLabel }: ConflictNoticeProps) {
  const t = useTx();
  return (
    <View style={styles.root} accessibilityRole="alert" testID="conflict-notice">
      <InfoCallout icon="refresh" title={title ?? t("citizen:nextSteps.conflict.title")}>
        {body ?? t("citizen:nextSteps.conflict.body")}
      </InfoCallout>
      <Button variant="secondary" icon="refresh" onPress={onReload} testID="conflict-reload">
        {reloadLabel ?? t("citizen:nextSteps.conflict.reload")}
      </Button>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { gap: spacing.sm },
});
