/**
 * Not accepted (HWM-09 task 5): why the server refused the change (validation / not allowed /
 * reassigned / not found / device blocked) in plain words. The change is kept on the device
 * (the default — nothing is ever deleted); "Copy details" hands ids + codes (no free text) to a
 * supervisor.
 */
import { Button, InfoCallout, spacing, StatusChip, useToast, useTx } from "@laif/ui-native";
import { StyleSheet, View } from "react-native";

import { rejectionDetailsText, type SyncOpRow } from "../../data/syncCenter.ts";
import { platform } from "../../platform";

export const REJECTION_KEYS = {
  validation: "worker:sync.rejected.validation",
  forbidden: "worker:sync.rejected.forbidden",
  reassigned: "worker:sync.rejected.reassigned",
  not_found: "worker:sync.rejected.not_found",
  revoked: "worker:sync.rejected.revoked",
} as const;

export function RejectedExplanation({ row }: { row: SyncOpRow }) {
  const t = useTx();
  const { toast } = useToast();
  const kind = row.rejection ?? "validation";
  const copy = async () => {
    const copied = await platform.copyText(rejectionDetailsText(row));
    toast(
      copied
        ? { title: t("worker:sync.rejected.copied"), tone: "positive" }
        : { title: t("worker:sync.rejected.copyUnavailable"), tone: "info" },
    );
  };
  return (
    <View style={styles.wrap} testID={`rejected-${row.op.id}`}>
      <InfoCallout icon="alert" testID={`rejected-reason-${row.op.id}`}>
        {t(REJECTION_KEYS[kind])}
      </InfoCallout>
      <View style={styles.actions}>
        <StatusChip tone="neutral" icon="lock" testID={`rejected-kept-${row.op.id}`}>
          {t("worker:sync.rejected.kept")}
        </StatusChip>
        <Button
          variant="secondary"
          size="sm"
          icon="file"
          testID={`copy-details-${row.op.id}`}
          onPress={copy}
        >
          {t("worker:sync.rejected.copy")}
        </Button>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: spacing.sm },
  actions: { flexDirection: "row", alignItems: "center", gap: spacing.sm, flexWrap: "wrap" },
});
