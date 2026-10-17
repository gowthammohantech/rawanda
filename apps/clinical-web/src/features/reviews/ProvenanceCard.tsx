/**
 * Source / provenance (CLN-06): recorded by (demo persona), device (not modelled in the demo),
 * source, facility, measuredAt and received ("synced") time in Kigali time, the screening
 * version and an amendments notice linking to the correction history.
 */
import type { Screening } from "@laif/domain";
import { domainKey, formatDateTime, useLanguage } from "@laif/i18n";
import { Card, InfoCallout, KeyValueList, useTx } from "@laif/ui-web";
import { Link } from "react-router";

import { facilityLabel } from "../../app/persona-labels.ts";
import { personaName } from "../timeline/people.ts";

export type ProvenanceCardProps = { screening: Screening | null; historyHref: string };

export function ProvenanceCard({ screening, historyHref }: ProvenanceCardProps) {
  const t = useTx();
  const { language } = useLanguage();
  if (screening === null) {
    return (
      <Card title={t("clinical:review.provenance.title")}>
        <p className="text-muted m-0 text-sm">{t("clinical:review.provenance.unavailable")}</p>
      </Card>
    );
  }
  const amendments = screening.amendments.length;
  return (
    <Card title={t("clinical:review.provenance.title")}>
      <div data-testid="provenance" className="space-y-3">
        <KeyValueList
          items={[
            {
              id: "recordedBy",
              label: t("clinical:review.provenance.recordedBy"),
              value: personaName(screening.workerId) ?? "—",
            },
            {
              id: "device",
              label: t("clinical:review.provenance.device"),
              value: t("clinical:review.provenance.deviceUnknown"),
            },
            {
              id: "source",
              label: t("clinical:review.provenance.source"),
              value: t(domainKey("screeningSource", screening.source)),
            },
            {
              id: "facility",
              label: t("clinical:review.provenance.facility"),
              value: facilityLabel(screening.facilityId, t),
            },
            {
              id: "measuredAt",
              label: t("clinical:review.provenance.measuredAt"),
              value: formatDateTime(screening.measuredAt, language),
            },
            {
              id: "syncedAt",
              label: t("clinical:review.provenance.syncedAt"),
              value: formatDateTime(screening.createdAt, language),
            },
            {
              id: "version",
              label: t("clinical:review.provenance.version"),
              value: <span className="font-mono">{`v${screening.version}`}</span>,
            },
            {
              id: "amendments",
              label: t("clinical:review.provenance.amendments"),
              value:
                amendments === 0
                  ? t("clinical:review.provenance.noAmendments")
                  : t("clinical:review.provenance.amendmentCount", { count: amendments }),
            },
          ]}
        />
        {amendments === 0 ? null : (
          <InfoCallout icon="file">
            <Link
              to={historyHref}
              className="text-primary-dark target-min inline-flex items-center font-semibold underline"
            >
              {t("clinical:review.evidence.openHistory")}
            </Link>
          </InfoCallout>
        )}
      </div>
    </Card>
  );
}
