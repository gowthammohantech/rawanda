/**
 * Overview tab (CLN-03 task 11): KPI strip (Screenings · Open reviews · Open referrals · Open
 * tasks, from repository list totals), latest screening summary, demographics, identity
 * provenance and the national-identity stub.
 */
import type { Patient } from "@laif/domain";
import { domainKey, formatDate, formatDateTime, useLanguage } from "@laif/i18n";
import {
  Card,
  KeyValueList,
  KpiStrip,
  LoadingSkeleton,
  ReadingDisplay,
  useTx,
  type TranslationKey,
} from "@laif/ui-web";

import { facilityLabel } from "../../app/persona-labels.ts";
import { QueryErrorState } from "../../components/QueryErrorState.tsx";
import { ExternalIdentityStub } from "./ExternalIdentityStub.tsx";
import { usePatientStats, type PatientStats } from "./hooks.ts";
import { IdentityProvenanceCard } from "./IdentityProvenanceCard.tsx";
import { ageLabel, sexLabel } from "./labels.ts";
import { patientAge } from "./model.ts";

function LatestScreening({ stats }: { stats: PatientStats }) {
  const t = useTx();
  const { language } = useLanguage();
  const s = stats.latestScreening;
  if (s === null) {
    return <p className="text-muted m-0 text-sm">{t("clinical:patients.record.latest.none")}</p>;
  }
  const notMeasured = (
    <span className="text-muted">{t("clinical:patients.record.latest.notMeasured")}</span>
  );
  return (
    <KeyValueList
      items={[
        {
          id: "measuredAt",
          label: t("clinical:patients.record.latest.measuredAt"),
          value: <time dateTime={s.measuredAt}>{formatDateTime(s.measuredAt, language)}</time>,
        },
        {
          id: "bp",
          label: t("clinical:patients.record.latest.bloodPressure"),
          value:
            s.systolic !== null && s.diastolic !== null ? (
              <ReadingDisplay kind="bloodPressure" systolic={s.systolic} diastolic={s.diastolic} />
            ) : (
              notMeasured
            ),
        },
        {
          id: "glucose",
          label: t("clinical:patients.record.latest.glucose"),
          value:
            s.glucoseValue !== null ? (
              <ReadingDisplay
                kind="glucose"
                value={s.glucoseValue}
                unit={s.glucoseUnit}
                context={s.glucoseContext}
              />
            ) : (
              notMeasured
            ),
        },
        {
          id: "source",
          label: t("clinical:patients.record.latest.source"),
          value: t(domainKey("screeningSource", s.source)),
        },
        {
          id: "status",
          label: t("clinical:patients.record.latest.status"),
          value: t(domainKey("status.screening", s.status)),
        },
      ]}
    />
  );
}

export function PatientOverview({ patient }: { patient: Patient }) {
  const t = useTx();
  const { language } = useLanguage();
  const stats = usePatientStats(patient);

  const demographics = stats.data === undefined ? null : patientAge(patient, stats.data.nowIso);

  return (
    <div className="space-y-4">
      {stats.data === undefined ? (
        stats.isError ? (
          <QueryErrorState error={stats.error} onRetry={() => void stats.refetch()} />
        ) : (
          <LoadingSkeleton variant="kpi" />
        )
      ) : (
        <div data-testid="patient-kpis">
          <KpiStrip
            label={t("clinical:patients.record.kpi.label")}
            items={[
              {
                id: "screenings",
                label: t("clinical:patients.record.kpi.screenings"),
                value: stats.data.screenings,
              },
              {
                id: "openReviews",
                label: t("clinical:patients.record.kpi.openReviews"),
                value: stats.data.openReviews,
              },
              {
                id: "openReferrals",
                label: t("clinical:patients.record.kpi.openReferrals"),
                value: stats.data.openReferrals,
              },
              {
                id: "openTasks",
                label: t("clinical:patients.record.kpi.openTasks"),
                value: stats.data.openTasks,
              },
            ]}
          />
        </div>
      )}
      <div className="grid items-start gap-4 lg:grid-cols-2">
        <Card title={t("clinical:patients.record.latest.title")} as="section">
          {stats.data === undefined ? (
            <LoadingSkeleton lines={4} />
          ) : (
            <LatestScreening stats={stats.data} />
          )}
        </Card>
        <Card title={t("clinical:patients.record.demographics.title")} as="section">
          <KeyValueList
            items={[
              {
                id: "dob",
                label: t("clinical:patients.record.demographics.dateOfBirth"),
                value:
                  patient.dateOfBirth === null
                    ? t("clinical:patients.record.demographics.notRecorded")
                    : formatDate(`${patient.dateOfBirth}T12:00:00.000Z`, language),
              },
              {
                id: "age",
                label: t("clinical:patients.record.demographics.age"),
                value: demographics === null ? "…" : ageLabel(t, demographics),
              },
              {
                id: "sex",
                label: t("clinical:patients.record.demographics.sex"),
                value: sexLabel(t, patient.sexOptional),
              },
              {
                id: "language",
                label: t("clinical:patients.record.demographics.language"),
                value: t(`common:languageName.${patient.preferredLanguage}` as TranslationKey),
              },
              {
                id: "facility",
                label: t("clinical:patients.record.demographics.facility"),
                value: facilityLabel(patient.facilityId, t),
              },
              {
                id: "district",
                label: t("clinical:patients.record.demographics.district"),
                value: t(`demo:entity.district.${patient.districtId}` as TranslationKey),
              },
              {
                id: "consent",
                label: t("clinical:patients.record.consent.label"),
                value: t(domainKey("consent", patient.consentState)),
              },
            ]}
          />
        </Card>
        <IdentityProvenanceCard patient={patient} />
        <ExternalIdentityStub syntheticIdentifier={patient.syntheticIdentifier} />
      </div>
    </div>
  );
}
