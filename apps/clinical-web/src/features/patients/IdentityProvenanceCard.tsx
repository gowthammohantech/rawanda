/**
 * Identity provenance (CLN-03, FRD §7): identifier type, issuing source (facility-scoped demo
 * ID), registered at (facility + time, Kigali), registered by (demo seed vs worker-app
 * registration, from the identifier's issuing prefix), identity status and record version.
 */
import type { Patient } from "@laif/domain";
import { domainKey, formatDateTime, useLanguage } from "@laif/i18n";
import { Card, KeyValueList, useTx } from "@laif/ui-web";

import { facilityLabel } from "../../app/persona-labels.ts";
import { registrationSource } from "./model.ts";

export function IdentityProvenanceCard({ patient }: { patient: Patient }) {
  const t = useTx();
  const { language } = useLanguage();
  const source = registrationSource(patient.syntheticIdentifier);
  return (
    <Card title={t("clinical:patients.record.provenance.title")} as="section">
      <div data-testid="identity-provenance">
        <KeyValueList
          items={[
            {
              id: "type",
              label: t("clinical:patients.record.provenance.identifierType"),
              value: t("clinical:patients.record.provenance.identifierTypeValue"),
            },
            {
              id: "identifier",
              label: t("clinical:patients.record.provenance.identifier"),
              value: <span className="font-mono">{patient.syntheticIdentifier}</span>,
            },
            {
              id: "source",
              label: t("clinical:patients.record.provenance.issuingSource"),
              value: t("clinical:patients.record.provenance.issuingSourceValue"),
            },
            {
              id: "registeredAt",
              label: t("clinical:patients.record.provenance.registeredAt"),
              value: t("clinical:patients.record.provenance.registeredAtValue", {
                facility: facilityLabel(patient.facilityId, t),
                date: formatDateTime(patient.createdAt, language),
              }),
            },
            {
              id: "registeredBy",
              label: t("clinical:patients.record.provenance.registeredBy"),
              value: t(
                source === "worker"
                  ? "clinical:patients.record.provenance.registeredByWorker"
                  : "clinical:patients.record.provenance.registeredBySeed",
              ),
            },
            {
              id: "identityStatus",
              label: t("clinical:patients.record.provenance.identityStatus"),
              value: t(domainKey("identity", patient.identityStatus)),
            },
            {
              id: "version",
              label: t("clinical:patients.record.provenance.version"),
              value: t("clinical:patients.record.provenance.versionValue", {
                version: patient.version,
                date: formatDateTime(patient.updatedAt, language),
              }),
            },
          ]}
        />
      </div>
    </Card>
  );
}
