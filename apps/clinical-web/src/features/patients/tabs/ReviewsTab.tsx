/**
 * Patient record › Reviews tab (CLN-04 task 7): the patient's reviews (status, flag reason
 * codes, assigned clinician, flagged / reviewed at) linking to `/clinical/reviews/:id`.
 */
import type { Patient, Review } from "@laif/domain";
import { domainKey, formatDateTime, useLanguage } from "@laif/i18n";
import {
  AccessibleDataTable,
  EmptyState,
  LoadingSkeleton,
  StatusChip,
  useTx,
  type DataTableColumn,
  type Tone,
} from "@laif/ui-web";
import { Link } from "react-router";

import { routes } from "../../../app/routes.ts";
import { QueryErrorState } from "../../../components/QueryErrorState.tsx";
import { usePatientReviews } from "../../timeline/hooks.ts";
import { personaName } from "../../timeline/people.ts";
import { STACK_BELOW_LG_CLASS } from "../../../components/responsive.ts";

const REVIEW_TONE: Readonly<Record<Review["status"], Tone>> = {
  pending: "warning",
  in_review: "info",
  action_recorded: "positive",
  dismissed_with_reason: "neutral",
};

export function ReviewsTab({ patient }: { patient: Patient }) {
  const t = useTx();
  const { language } = useLanguage();
  const reviews = usePatientReviews(patient.id);

  if (reviews.isPending) {
    return (
      <div role="group" aria-busy="true" aria-label={t("clinical:timeline.reviews.loading")}>
        <LoadingSkeleton variant="table" lines={3} />
      </div>
    );
  }
  if (reviews.isError) {
    return <QueryErrorState error={reviews.error} onRetry={() => void reviews.refetch()} />;
  }

  const columns: DataTableColumn<Review>[] = [
    {
      id: "flaggedAt",
      header: t("clinical:timeline.reviews.flaggedAt"),
      isRowHeader: true,
      sortValue: (row) => row.createdAt,
      cell: (row) => (
        <Link
          to={routes.review(row.id)}
          className="text-primary-dark target-min inline-flex items-center font-semibold underline"
          aria-label={t("clinical:timeline.reviews.openLabel", {
            time: formatDateTime(row.createdAt, language),
          })}
        >
          {formatDateTime(row.createdAt, language)}
        </Link>
      ),
    },
    {
      id: "status",
      header: t("clinical:timeline.reviews.status"),
      cell: (row) => (
        <StatusChip tone={REVIEW_TONE[row.status]}>
          {t(domainKey("status.review", row.status))}
        </StatusChip>
      ),
    },
    {
      id: "flagReasons",
      header: t("clinical:timeline.reviews.flagReasons"),
      cell: (row) => (
        <ul className="m-0 list-none space-y-0.5 p-0 text-[13px]">
          {row.flagReasons.map((code) => (
            <li key={code}>
              <span className="text-muted me-1 font-mono text-xs">{code}</span>
              {t(domainKey("reason", code))}
            </li>
          ))}
        </ul>
      ),
    },
    {
      id: "assigned",
      header: t("clinical:timeline.reviews.assigned"),
      cell: (row) =>
        personaName(row.assignedClinicianId) ?? t("clinical:timeline.reviews.unassigned"),
    },
    {
      id: "reviewedAt",
      header: t("clinical:timeline.reviews.reviewedAt"),
      sortValue: (row) => row.reviewedAt,
      cell: (row) =>
        row.reviewedAt === null ? (
          <span className="text-muted">{t("clinical:timeline.reviews.notReviewed")}</span>
        ) : (
          <time dateTime={row.reviewedAt}>{formatDateTime(row.reviewedAt, language)}</time>
        ),
    },
  ];

  return (
    <div data-testid="patient-reviews">
      <AccessibleDataTable
        className={STACK_BELOW_LG_CLASS}
        caption={t("clinical:timeline.reviews.caption")}
        captionHidden
        columns={columns}
        rows={reviews.data}
        getRowId={(row) => row.id}
        emptyState={<EmptyState icon="clipboard" title={t("clinical:timeline.reviews.empty")} />}
      />
    </div>
  );
}
