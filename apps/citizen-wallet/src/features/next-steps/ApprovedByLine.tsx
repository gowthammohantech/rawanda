/**
 * "Agreed by {clinician} · {date}" (CTZ-04 task 2) — the responsible professional who approved
 * (released) the step, from synthetic demo persona reference data; date in Africa/Kigali.
 */
import type { ApprovedInstruction } from "@laif/domain";
import { formatDate, useLanguage } from "@laif/i18n";
import { AppText, useTx } from "@laif/ui-native";

import { reviewerOf } from "../health/copy.ts";

export function approvedByText(
  t: ReturnType<typeof useTx>,
  step: Pick<ApprovedInstruction, "releasedBy" | "releasedAt">,
  language: Parameters<typeof formatDate>[1],
): string {
  const date = formatDate(step.releasedAt, language);
  const approver = reviewerOf(step.releasedBy);
  return approver === null
    ? t("citizen:nextSteps.approvedByTeam", { date })
    : t("citizen:nextSteps.approvedBy", { name: approver.name, date });
}

export function ApprovedByLine({
  step,
}: {
  step: Pick<ApprovedInstruction, "releasedBy" | "releasedAt">;
}) {
  const t = useTx();
  const { language } = useLanguage();
  return (
    <AppText variant="caption" color="muted" testID="approved-by">
      {approvedByText(t, step, language)}
    </AppText>
  );
}
