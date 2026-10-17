/**
 * Patient record header (CLN-03): initials avatar, name, synthetic ID, `SYNTHETIC` pill,
 * facility, consent chip and identity-status chip (text + icon, never colour only).
 */
import type { ConsentState, IdentityStatus, Patient } from "@laif/domain";
import { domainKey } from "@laif/i18n";
import { Avatar, StatusChip, useTx, type Tone } from "@laif/ui-web";

import { facilityLabel } from "../../app/persona-labels.ts";

const CONSENT_TONE: Record<ConsentState, Tone> = {
  granted: "positive",
  withdrawn: "danger",
  not_recorded: "neutral",
};

const IDENTITY_TONE: Record<IdentityStatus, Tone> = {
  verified_local: "positive",
  unverified: "neutral",
  possible_duplicate: "warning",
  needs_match_review: "warning",
};

export function PatientHeader({ patient }: { patient: Patient }) {
  const t = useTx();
  const consent = t(domainKey("consent", patient.consentState));
  const identity = t(domainKey("identity", patient.identityStatus));
  return (
    <section
      aria-labelledby="patient-name"
      data-testid="patient-header"
      className="border-border-soft bg-surface shadow-card flex flex-wrap items-center gap-4 rounded-lg border p-4"
    >
      <Avatar name={patient.displayName} size="lg" decorative />
      <div className="min-w-0 flex-1 space-y-1">
        <div className="flex flex-wrap items-center gap-2">
          <h2 id="patient-name" className="text-ink m-0 text-xl font-semibold">
            {patient.displayName}
          </h2>
          <StatusChip tone="info" icon="info">
            {t("clinical:patients.record.header.synthetic")}
          </StatusChip>
        </div>
        <p className="text-muted m-0 flex flex-wrap gap-x-4 gap-y-1 text-sm">
          <span>
            {t("clinical:patients.record.header.syntheticId")}:{" "}
            <span className="text-ink font-mono">{patient.syntheticIdentifier}</span>
          </span>
          <span>
            {t("clinical:patients.record.header.facility")}:{" "}
            <span className="text-ink">{facilityLabel(patient.facilityId, t)}</span>
          </span>
        </p>
      </div>
      <div className="flex flex-wrap gap-2">
        <StatusChip tone={CONSENT_TONE[patient.consentState]}>
          {t("clinical:patients.record.consent.chip", { state: consent })}
        </StatusChip>
        <StatusChip tone={IDENTITY_TONE[patient.identityStatus]}>
          {t("clinical:patients.record.header.identity", { status: identity })}
        </StatusChip>
      </div>
    </section>
  );
}
