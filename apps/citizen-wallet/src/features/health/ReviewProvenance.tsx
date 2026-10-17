/**
 * Who reviewed a result and when it was shared (CTZ-03; PRD §6 "show review status and
 * responsible professional"). Times in Africa/Kigali via `@laif/i18n`.
 */
import type { ReleasedObservation } from "@laif/domain";
import { formatDateTime, useLanguage } from "@laif/i18n";
import { AppText, KeyValueList, useTx } from "@laif/ui-native";

import { reviewerOf } from "./copy.ts";

type Props = {
  result: Pick<ReleasedObservation, "reviewedBy" | "reviewedAt" | "measuredAt">;
  /** `line` = one caption line (cards); `detail` = labelled rows. */
  variant?: "line" | "detail";
};

export function ReviewProvenance({ result, variant = "line" }: Props) {
  const t = useTx();
  const { language } = useLanguage();
  const reviewer = reviewerOf(result.reviewedBy);
  const sharedAt = result.reviewedAt ?? result.measuredAt;
  const time = formatDateTime(sharedAt, language);
  if (variant === "line") {
    return (
      <AppText variant="caption" color="muted" testID="review-provenance">
        {reviewer === null
          ? t("citizen:health.sharedNoReview", { time })
          : t("citizen:health.reviewedBy", { name: reviewer.name, time })}
      </AppText>
    );
  }
  return (
    <KeyValueList
      testID="review-provenance"
      items={[
        {
          id: "reviewer",
          label: t("citizen:health.detail.reviewer"),
          value:
            reviewer === null
              ? t("citizen:health.detail.noReviewer")
              : t("citizen:health.detail.reviewerValue", {
                  name: reviewer.name,
                  role: t(reviewer.roleKey),
                }),
        },
        { id: "released", label: t("citizen:health.detail.released"), value: time },
      ]}
    />
  );
}
