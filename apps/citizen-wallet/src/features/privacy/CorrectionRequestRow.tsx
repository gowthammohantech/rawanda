/** One correction request in a list: subject, "Sent on …", reference and status chip. */
import type { CorrectionRequest } from "@laif/contracts";
import { formatDate, useLanguage } from "@laif/i18n";
import type { CorrectionTarget } from "@laif/repositories/citizen";
import { ListRow, StatusChip, useTx } from "@laif/ui-native";

import { STATUS_CHIPS, correctionRef, requestTargetLabel } from "./copy.ts";

export function CorrectionStatusChip({ status }: { status: CorrectionRequest["status"] }) {
  const t = useTx();
  const chip = STATUS_CHIPS[status];
  return (
    <StatusChip tone={chip.tone} icon={chip.icon} testID="correction-status-chip">
      {t(chip.key)}
    </StatusChip>
  );
}

export function CorrectionRequestRow({
  request,
  targets,
  onPress,
}: {
  request: CorrectionRequest;
  targets: readonly CorrectionTarget[] | undefined;
  onPress: () => void;
}) {
  const t = useTx();
  const { language } = useLanguage();
  return (
    <ListRow
      icon="file"
      title={requestTargetLabel(t, request, targets, language)}
      subtitle={t("citizen:correction.list.sentOn", {
        date: formatDate(request.createdAt, language),
      })}
      meta={correctionRef(request.id)}
      trailing={<CorrectionStatusChip status={request.status} />}
      onPress={onPress}
      accessibilityLabel={`${requestTargetLabel(t, request, targets, language)}, ${t(
        STATUS_CHIPS[request.status].key,
      )}, ${correctionRef(request.id)}`}
      testID={`correction-row-${request.id}`}
    />
  );
}
