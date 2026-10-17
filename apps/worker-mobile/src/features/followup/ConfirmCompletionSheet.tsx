/**
 * Completion confirmation for `attended` (HWM-08 task 4): summary (outcome, evidence, time) +
 * "This marks the follow-up as completed" → Confirm / Back. While saving, Confirm is busy and
 * the sheet cannot be dismissed; a second tap is a no-op (the write is idempotent anyway).
 */
import type { WorkerEvidenceType } from "@laif/domain";
import { domainKey, formatDateTime, useLanguage } from "@laif/i18n";
import { AppText, Button, KeyValueList, Sheet, useTx } from "@laif/ui-native";

export type ConfirmCompletionSheetProps = {
  visible: boolean;
  evidenceType: WorkerEvidenceType | null;
  occurredAt: string | null;
  saving: boolean;
  onConfirm: () => void;
  onBack: () => void;
};

export function ConfirmCompletionSheet({
  visible,
  evidenceType,
  occurredAt,
  saving,
  onConfirm,
  onBack,
}: ConfirmCompletionSheetProps) {
  const t = useTx();
  const { language } = useLanguage();
  return (
    <Sheet
      visible={visible}
      onClose={onBack}
      dismissible={!saving}
      title={t("worker:followup.confirm.title")}
      testID="confirm-completion-sheet"
      footer={
        <>
          <Button
            fullWidth
            icon="check"
            loading={saving}
            testID="confirm-completion"
            onPress={() => {
              if (!saving) onConfirm();
            }}
          >
            {saving ? t("common:dialog.saving") : t("worker:followup.confirm.confirm")}
          </Button>
          <Button
            variant="secondary"
            fullWidth
            disabled={saving}
            testID="confirm-completion-back"
            onPress={onBack}
          >
            {t("worker:followup.confirm.back")}
          </Button>
        </>
      }
    >
      <KeyValueList
        testID="confirm-completion-summary"
        items={[
          {
            id: "outcome",
            label: t("worker:followup.confirm.outcome"),
            value: t("worker:followup.outcome.attended"),
          },
          {
            id: "evidence",
            label: t("worker:followup.confirm.evidence"),
            value: evidenceType === null ? "—" : t(domainKey("evidence", evidenceType)),
          },
          {
            id: "time",
            label: t("worker:followup.confirm.time"),
            value: occurredAt === null ? "—" : formatDateTime(occurredAt, language),
          },
        ]}
      />
      <AppText weight="semibold" testID="confirm-completion-effect">
        {t("worker:followup.confirmCompletion")}
      </AppText>
      <AppText color="muted">{t("worker:followup.outcome.attendedCaption")}</AppText>
    </Sheet>
  );
}
