/**
 * Prior records (CLN-06 task 6): the patient's last 5 screenings (newest first, effective values
 * after amendments) with a systolic trend as TEXT + arrow ("↑ Higher than previous" — never
 * colour only), the flag state, a "repeat reading" marker and "This screening" on the reviewed one.
 */
import { effectiveReadings, type Screening } from "@laif/domain";
import { formatDateTime, useLanguage } from "@laif/i18n";
import {
  AccessibleDataTable,
  Card,
  EmptyState,
  LoadingSkeleton,
  StatusChip,
  useTx,
  type DataTableColumn,
} from "@laif/ui-web";

import { QueryErrorState } from "../../components/QueryErrorState.tsx";
import { useScreenings } from "../timeline/hooks.ts";
import { ReadingDisplay } from "../timeline/ReadingDisplay.tsx";

export const PRIOR_RECORDS_LIMIT = 5;

type Row = { screening: Screening; older: Screening | null };

const hasRepeat = (s: Screening) =>
  s.observations.some((o) => o.code === "SYSTOLIC_REPEAT" || o.code === "DIASTOLIC_REPEAT");

export type Trend = "up" | "down" | "same" | "none";

export function systolicTrend(current: Screening, older: Screening | null): Trend {
  const now = effectiveReadings(current).systolic;
  const before = older === null ? null : effectiveReadings(older).systolic;
  if (now === null || before === null) return "none";
  if (now > before) return "up";
  if (now < before) return "down";
  return "same";
}

export type PriorRecordsCardProps = { patientId: string; currentScreeningId: string | null };

export function PriorRecordsCard({ patientId, currentScreeningId }: PriorRecordsCardProps) {
  const t = useTx();
  const { language } = useLanguage();
  const query = useScreenings(patientId);

  const columns: DataTableColumn<Row>[] = [
    {
      id: "measuredAt",
      header: t("clinical:review.prior.columns.measuredAt"),
      isRowHeader: true,
      cell: ({ screening }) => (
        <span className="inline-flex flex-col gap-1">
          <span>{formatDateTime(effectiveReadings(screening).measuredAt, language)}</span>
          {screening.id === currentScreeningId ? (
            <StatusChip tone="info">{t("clinical:review.prior.thisScreening")}</StatusChip>
          ) : null}
        </span>
      ),
    },
    {
      id: "bp",
      header: t("clinical:review.prior.columns.bp"),
      cell: ({ screening }) => {
        const r = effectiveReadings(screening);
        return (
          <span className="inline-flex flex-col gap-1">
            <ReadingDisplay kind="bloodPressure" systolic={r.systolic} diastolic={r.diastolic} />
            {hasRepeat(screening) ? (
              <span className="text-muted text-xs" data-testid="prior-repeat">
                {t("clinical:review.prior.repeat")}
              </span>
            ) : null}
          </span>
        );
      },
    },
    {
      id: "glucose",
      header: t("clinical:review.prior.columns.glucose"),
      cell: ({ screening }) => {
        const r = effectiveReadings(screening);
        return (
          <ReadingDisplay
            kind="glucose"
            value={r.glucoseValue}
            unit={r.glucoseUnit}
            context={r.glucoseContext}
          />
        );
      },
    },
    {
      id: "trend",
      header: t("clinical:review.prior.columns.trend"),
      cell: ({ screening, older }) => {
        const trend = systolicTrend(screening, older);
        return (
          <span data-testid="prior-trend" data-trend={trend}>
            {t(`clinical:review.prior.trend.${trend}`)}
          </span>
        );
      },
    },
    {
      id: "flag",
      header: t("clinical:review.prior.columns.flag"),
      cell: ({ screening }) =>
        screening.flag?.requiresReview === true ? (
          <StatusChip tone="warning">{t("clinical:review.prior.flagged")}</StatusChip>
        ) : (
          <span className="text-muted">{t("clinical:review.prior.notFlagged")}</span>
        ),
    },
  ];

  let body;
  if (query.isPending) {
    body = <LoadingSkeleton variant="table" lines={3} />;
  } else if (query.isError) {
    body = <QueryErrorState error={query.error} onRetry={() => void query.refetch()} />;
  } else {
    const all = query.data.screenings;
    const rows: Row[] = all
      .slice(0, PRIOR_RECORDS_LIMIT)
      .map((screening, i) => ({ screening, older: all[i + 1] ?? null }));
    body = (
      <AccessibleDataTable
        caption={t("clinical:review.prior.caption")}
        captionHidden
        columns={columns}
        rows={rows}
        getRowId={(row) => row.screening.id}
        hideCount
        emptyState={<EmptyState icon="clipboard" title={t("clinical:review.prior.empty")} />}
      />
    );
  }

  return (
    <Card title={t("clinical:review.prior.title")} meta={t("clinical:review.prior.subtitle")}>
      <div data-testid="prior-records">{body}</div>
    </Card>
  );
}
