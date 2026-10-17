/**
 * Expanded queue row (CLN-05, ref-image "Needs you" pattern): `TRIGGERING READINGS` (frozen
 * evidence snapshot: compared value + demo threshold), `WHY THIS NEEDS REVIEW` callout (FND-02
 * reason codes → `domain:reason.<code>`, "demo threshold" wording, never a diagnosis), the demo
 * rule disclaimer, ruleset version, source, demo due date, assignee — and the actions:
 * `Open review` (primary) and `Open patient`.
 */
import { domainKey, formatDateTime, formatMeasurement, useLanguage } from "@laif/i18n";
import {
  Button,
  InfoCallout,
  KeyValueList,
  MicroLabel,
  RuleDisclaimer,
  useTx,
  type KeyValueItem,
} from "@laif/ui-web";
import { useNavigate } from "react-router";

import { routes } from "../../app/routes.ts";
import { personaName } from "../timeline/people.ts";
import type { QueueItem } from "./useReviewQueue.ts";

export type QueueRowDetailProps = { item: QueueItem };

export function QueueRowDetail({ item }: QueueRowDetailProps) {
  const t = useTx();
  const { language } = useLanguage();
  const navigate = useNavigate();
  const { review, screening } = item;
  const flag = review.evidenceSnapshot.flag;
  const readings = flag.triggeringObservations;
  const reasons = review.flagReasons;
  const rulesetVersion = screening?.rulesetVersion ?? flag.rulesetVersion;

  const facts: KeyValueItem[] = [
    { label: t("clinical:queue.row.rulesetVersion"), value: rulesetVersion },
    {
      label: t("clinical:queue.row.source"),
      value:
        screening === null
          ? t("clinical:queue.row.sourceUnknown")
          : t(domainKey("screeningSource", screening.source)),
    },
    ...(screening === null
      ? []
      : [
          {
            label: t("clinical:queue.row.measuredAt"),
            value: formatDateTime(screening.measuredAt, language),
          },
        ]),
    {
      label: t("clinical:queue.row.dueAt"),
      value:
        review.reviewDueAt === null
          ? t("clinical:queue.row.noDueDate")
          : formatDateTime(review.reviewDueAt, language),
    },
    {
      label: t("clinical:queue.row.assignedTo"),
      value: personaName(review.assignedClinicianId) ?? t("clinical:queue.row.unassigned"),
    },
  ];

  return (
    <div className="space-y-4" data-testid="queue-row-detail">
      <div className="grid gap-4 lg:grid-cols-2">
        <section aria-labelledby={`readings-${review.id}`} className="space-y-2">
          <MicroLabel as="h4" id={`readings-${review.id}`}>
            {t("clinical:queue.row.triggeringReadings")}
          </MicroLabel>
          {readings.length === 0 ? (
            <p className="text-muted m-0 text-sm">{t("clinical:queue.row.noTriggeringReadings")}</p>
          ) : (
            <ul className="m-0 list-none space-y-1.5 p-0" data-testid="triggering-readings">
              {readings.map((reading) => (
                <li key={reading.code} className="flex flex-wrap items-baseline gap-x-2 text-sm">
                  <span className="text-ink">{t(domainKey("observation", reading.code))}</span>
                  <span className="text-ink font-mono font-semibold">
                    {formatMeasurement(reading.value, reading.unit, language)}
                  </span>
                  <span className="text-muted text-xs">
                    {t("clinical:queue.row.comparedTo", {
                      value: formatMeasurement(reading.comparedTo, reading.unit, language),
                    })}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </section>
        <InfoCallout title={t("clinical:queue.row.whyReview")} icon="info">
          {reasons.length === 0 ? (
            <p className="m-0">{t("clinical:queue.row.manualEscalation")}</p>
          ) : (
            <ul className="m-0 list-disc space-y-1 ps-5" data-testid="flag-reasons">
              {reasons.map((code) => (
                <li key={code}>{t(domainKey("reason", code))}</li>
              ))}
            </ul>
          )}
        </InfoCallout>
      </div>
      <RuleDisclaimer compact />
      <KeyValueList items={facts} />
      <div className="flex flex-wrap justify-end gap-2">
        <Button variant="secondary" onClick={() => navigate(routes.patient(review.patientId))}>
          {t("clinical:queue.row.openPatient")}
        </Button>
        <Button
          variant="primary"
          icon="arrow"
          iconPosition="end"
          onClick={() => navigate(routes.review(review.id))}
        >
          {t("clinical:queue.row.openReview")}
        </Button>
      </div>
    </div>
  );
}
