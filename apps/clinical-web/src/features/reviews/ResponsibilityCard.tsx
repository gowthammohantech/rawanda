/**
 * Responsibility (CLN-06, PRD §6 "show review status and responsible professional"): assigned
 * clinician, review status, who started it, last update, and who decided it and when. Reassigning
 * is out of scope (read-only, noted).
 */
import type { Review } from "@laif/domain";
import { domainKey, formatDateTime, useLanguage } from "@laif/i18n";
import { Card, KeyValueList, useTx } from "@laif/ui-web";

import { personaName } from "../timeline/people.ts";

export type ResponsibilityCardProps = { review: Review; myPersonaId: string | null };

export function ResponsibilityCard({ review, myPersonaId }: ResponsibilityCardProps) {
  const t = useTx();
  const { language } = useLanguage();
  const who = (id: string | null) => {
    const name = personaName(id);
    if (name === null) return null;
    return id === myPersonaId ? t("clinical:review.responsibility.you", { name }) : name;
  };
  const decidedBy = review.decision?.decidedBy ?? review.reviewedBy;
  const decidedAt = review.decision?.decidedAt ?? review.reviewedAt;
  return (
    <Card title={t("clinical:review.responsibility.title")}>
      <div data-testid="responsibility" className="space-y-3">
        <KeyValueList
          items={[
            {
              id: "assigned",
              label: t("clinical:review.responsibility.assigned"),
              value:
                who(review.assignedClinicianId) ?? t("clinical:review.responsibility.unassigned"),
            },
            {
              id: "status",
              label: t("clinical:review.responsibility.status"),
              value: t(domainKey("status.review", review.status)),
            },
            {
              id: "startedBy",
              label: t("clinical:review.responsibility.startedBy"),
              value: who(review.startedBy) ?? t("clinical:review.responsibility.notStarted"),
            },
            {
              id: "lastUpdated",
              label: t("clinical:review.responsibility.lastUpdated"),
              value: formatDateTime(review.updatedAt, language),
            },
            {
              id: "decidedBy",
              label: t("clinical:review.responsibility.decidedBy"),
              value: who(decidedBy ?? null) ?? t("clinical:review.responsibility.notDecided"),
            },
            ...(decidedAt === null || decidedAt === undefined
              ? []
              : [
                  {
                    id: "decidedAt",
                    label: t("clinical:review.responsibility.decidedAt"),
                    value: formatDateTime(decidedAt, language),
                  },
                ]),
          ]}
        />
        <p className="text-muted m-0 text-xs">{t("clinical:review.responsibility.reassignNote")}</p>
      </div>
    </Card>
  );
}
