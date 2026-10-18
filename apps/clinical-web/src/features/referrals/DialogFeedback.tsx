/**
 * Shared failure feedback of the referral dialogs (CLN-08 UX states):
 * - `CONFLICT` (stale `expectedVersion` or the simulated "Conflict on next write") → the shared
 *   `ConflictPanel` comparing the copy the user saw with the latest one; "Reload latest" swaps the
 *   dialog onto the latest version (nothing is re-applied automatically);
 * - `REFERRAL_ALREADY_OPEN` (create) → message + link to the open referral;
 * - server error / timeout / offline → the dialog keeps the values, retry re-sends with the SAME
 *   idempotency key.
 * Field-level `VALIDATION_ERROR`s are shown on the fields by the dialogs themselves.
 */
import type { Referral } from "@laif/domain";
import { domainKey, formatDateTime, useLanguage } from "@laif/i18n";
import { Button, useTx, type ConflictRow } from "@laif/ui-web";
import { Link } from "react-router";

import { routes } from "../../app/routes.ts";
import { ConflictPanel } from "../../components/ConflictPanel.tsx";
import { clinicalErrorKeys, type ClinicalError } from "../../data/errors.ts";
import { facilityLabel } from "../../app/persona-labels.ts";

export type DialogFeedbackProps = {
  error: ClinicalError | null;
  /** The copy the dialog was opened on (conflict comparison). */
  mine?: Referral | null;
  canRetry: boolean;
  retrying: boolean;
  onRetry: () => unknown;
  onReload: (latest: Referral) => unknown;
  onCancel: () => unknown;
};

export function useConflictRows() {
  const t = useTx();
  const { language } = useLanguage();
  return (mine: Referral | null, latest: Referral): ConflictRow[] => [
    {
      id: "status",
      label: t("clinical:referrals.table.status"),
      yours: mine === null ? "—" : t(domainKey("status.referral", mine.status)),
      latest: t(domainKey("status.referral", latest.status)),
    },
    {
      id: "destination",
      label: t("clinical:referrals.table.destination"),
      yours: mine === null ? "—" : facilityLabel(mine.destinationFacilityId, t),
      latest: facilityLabel(latest.destinationFacilityId, t),
    },
    {
      id: "due",
      label: t("clinical:referrals.table.due"),
      yours: mine === null ? "—" : formatDateTime(mine.dueAt, language),
      latest: formatDateTime(latest.dueAt, language),
    },
  ];
}

export function DialogFeedback({
  error,
  mine = null,
  canRetry,
  retrying,
  onRetry,
  onReload,
  onCancel,
}: DialogFeedbackProps) {
  const t = useTx();
  const rows = useConflictRows();
  if (error === null || error.code === "VALIDATION_ERROR") {
    if (error?.reason === "INVALID_TRANSITION") {
      return (
        <p
          role="alert"
          data-testid="referral-invalid-transition"
          className="text-risk-danger m-0 text-[13px] font-medium"
        >
          {t("clinical:referrals.errors.invalidTransition")}
        </p>
      );
    }
    return null;
  }
  if (error.code === "CONFLICT" && error.reason === "REFERRAL_ALREADY_OPEN") {
    const open = (error.latest ?? null) as Referral | null;
    return (
      <section
        role="alert"
        data-testid="referral-already-open"
        className="border-risk-warning/30 bg-risk-warning-soft space-y-2 rounded-md border p-3 text-[13px]"
      >
        <p className="text-ink m-0 font-semibold">{t("clinical:referrals.errors.alreadyOpen")}</p>
        {open === null ? null : (
          <Link
            to={routes.referrals({ id: open.id })}
            className="text-primary-dark target-min inline-flex items-center font-semibold underline"
            onClick={() => onCancel()}
          >
            {t("clinical:referrals.errors.viewOpen")}
          </Link>
        )}
      </section>
    );
  }
  if (error.code === "CONFLICT" && error.conflict !== undefined) {
    const latest = (error.latest ?? null) as Referral | null;
    return (
      <ConflictPanel
        conflict={error.conflict}
        rows={latest === null ? [] : rows(mine, latest)}
        title={t("clinical:referrals.conflict.title")}
        description={t("clinical:referrals.conflict.body")}
        onReload={() => (latest === null ? undefined : onReload(latest))}
        onCancel={() => onCancel()}
      />
    );
  }
  return (
    <section
      role="alert"
      data-testid="referral-dialog-failed"
      className="border-risk-danger/25 bg-risk-danger-soft space-y-2 rounded-md border p-3 text-[13px]"
    >
      <p className="text-risk-danger m-0 font-semibold">{t(clinicalErrorKeys(error.code).title)}</p>
      <p className="text-ink m-0">{t("clinical:referrals.dialog.failed")}</p>
      {canRetry ? (
        <Button
          variant="secondary"
          size="sm"
          icon="refresh"
          loading={retrying}
          onClick={() => void onRetry()}
        >
          {t("clinical:referrals.dialog.retry")}
        </Button>
      ) : null}
    </section>
  );
}
