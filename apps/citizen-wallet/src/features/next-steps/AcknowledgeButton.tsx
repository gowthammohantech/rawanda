/**
 * "I have read this" (CTZ-04 task 4). Disabled while saving; on success the button is replaced
 * by "Read on {date}" with a check icon and a screen-reader announcement. A server error keeps
 * the idempotency key and offers Retry (T-09); a conflict shows `ConflictNotice` and reloads the
 * step (T-05). Acknowledging is not completion — the step's status never changes.
 */
import type { ApprovedInstruction } from "@laif/domain";
import { formatDateTime, useLanguage } from "@laif/i18n";
import { AppText, Button, Icon, announce, colors, spacing, useTx } from "@laif/ui-native";
import { useEffect } from "react";
import { StyleSheet, View } from "react-native";

import { InlineError } from "../../components/InlineError.tsx";
import { ConflictNotice } from "./ConflictNotice.tsx";
import { useAcknowledge } from "./useAcknowledge.ts";

export type AcknowledgeButtonProps = {
  step: Pick<ApprovedInstruction, "id" | "patientId" | "version" | "acknowledgement">;
  /** Reload the step after a conflict (shows the latest version). */
  onReload: () => unknown;
};

export function AcknowledgeButton({ step, onReload }: AcknowledgeButtonProps) {
  const t = useTx();
  const { language } = useLanguage();
  const ack = useAcknowledge(step);

  useEffect(() => {
    if (ack.status === "success") announce(t("citizen:nextSteps.acknowledgedAnnounce"));
  }, [ack.status, t]);

  if (ack.acknowledgedAt !== null) {
    return (
      <View
        style={styles.read}
        accessibilityLiveRegion="polite"
        accessibilityRole="text"
        testID="acknowledged"
      >
        <Icon name="check" size={18} color={colors.positive} />
        <AppText weight="semibold" color="positive">
          {t("citizen:nextSteps.acknowledgedOn", {
            date: formatDateTime(ack.acknowledgedAt, language),
          })}
        </AppText>
      </View>
    );
  }

  return (
    <View style={styles.root}>
      {ack.status === "conflict" ? (
        <ConflictNotice
          onReload={async () => {
            await onReload();
            ack.dismissConflict();
          }}
        />
      ) : null}
      <Button
        icon="check"
        loading={ack.status === "pending"}
        disabled={ack.status === "pending" || ack.status === "conflict"}
        onPress={ack.acknowledge}
        accessibilityHint={t("citizen:nextSteps.acknowledgeHint")}
        testID="acknowledge"
      >
        {ack.status === "error" ? t("citizen:nextSteps.retry") : t("citizen:nextSteps.acknowledge")}
      </Button>
      <InlineError
        testID="acknowledge-error"
        message={ack.status === "error" ? t("citizen:nextSteps.ackError") : null}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { gap: spacing.sm },
  read: { flexDirection: "row", alignItems: "center", gap: spacing.sm, minHeight: 44 },
});
