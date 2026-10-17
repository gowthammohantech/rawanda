/**
 * "Send a test reminder to this phone" (CTZ-05 task 8) — device builds only (hidden on web and
 * wherever the adapter cannot preview). Requests OS permission, then schedules ONE local
 * notification with the safe generic text 5 s later and records `citizen.reminder.preview_sent`.
 * Permission denied → an info card explaining how to enable it; nothing else is affected.
 */
import type { ReminderTiming } from "@laif/domain";
import { Button, InfoCallout, spacing, useToast, useTx } from "@laif/ui-native";
import { useState } from "react";
import { StyleSheet, View } from "react-native";

import { useCitizenRepo } from "../../data/repo.tsx";
import { InlineError } from "../../components/InlineError.tsx";
import { useNotificationAdapter } from "./notifications.tsx";
import { safeReminderContent } from "./safeContent.ts";

type PreviewStatus = "idle" | "pending" | "denied" | "failed";

export function PreviewNotificationButton({
  patientId,
  timing,
}: {
  patientId: string;
  timing: ReminderTiming;
}) {
  const t = useTx();
  const repo = useCitizenRepo();
  const adapter = useNotificationAdapter();
  const { toast } = useToast();
  const [status, setStatus] = useState<PreviewStatus>("idle");
  if (!adapter.canPreview) return null;

  const send = async () => {
    setStatus("pending");
    try {
      if ((await adapter.ensurePermission()) === "denied") {
        setStatus("denied");
        return;
      }
      await adapter.schedulePreview(safeReminderContent(t, timing));
      await repo.recordReminderPreviewSent(patientId).catch(() => undefined);
      toast({ title: t("citizen:reminders.preview.sent"), tone: "positive" });
      setStatus("idle");
    } catch {
      setStatus("failed");
    }
  };

  return (
    <View style={styles.root} testID="preview-notification">
      <Button
        variant="secondary"
        icon="bell"
        loading={status === "pending"}
        disabled={status === "pending"}
        onPress={send}
        accessibilityHint={t("citizen:reminders.preview.hint")}
        testID="preview-notification-button"
      >
        {t("citizen:reminders.preview.button")}
      </Button>
      {status === "denied" ? (
        <InfoCallout icon="info" testID="preview-permission-denied">
          {t("citizen:reminders.preview.permissionDenied")}
        </InfoCallout>
      ) : null}
      <InlineError message={status === "failed" ? t("citizen:reminders.preview.failed") : null} />
    </View>
  );
}

const styles = StyleSheet.create({ root: { gap: spacing.sm } });
