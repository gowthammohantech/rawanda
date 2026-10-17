/**
 * Stale-conflict notice (CTZ-04 task 4, T-05): the care team changed this step after it was
 * shown, so nothing was saved. The citizen reloads the latest version and reads it again.
 */
import { Button, InfoCallout, spacing, useTx } from "@laif/ui-native";
import { StyleSheet, View } from "react-native";

export function ConflictNotice({ onReload }: { onReload: () => unknown }) {
  const t = useTx();
  return (
    <View style={styles.root} accessibilityRole="alert" testID="conflict-notice">
      <InfoCallout icon="refresh" title={t("citizen:nextSteps.conflict.title")}>
        {t("citizen:nextSteps.conflict.body")}
      </InfoCallout>
      <Button variant="secondary" icon="refresh" onPress={onReload} testID="conflict-reload">
        {t("citizen:nextSteps.conflict.reload")}
      </Button>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { gap: spacing.sm },
});
