/**
 * "Pending reviews by age" (ADM-04): one thin progress bar per age bucket with its count, under
 * the mono label NO APPROVED REVIEW TARGET. Deliberately never says "overdue" — no review target
 * is approved by the clinical protocol owner (FRD §5). Hidden buckets show `<k` and no bar.
 */
import { PENDING_AGE_BUCKETS, type AggregateCell, type PendingAgeBucket } from "@laif/analytics";
import { Card, MicroLabel, useTx, type TranslationKey } from "@laif/ui-web";
import type { ReactNode } from "react";

import { BAR_FILL_CLASS } from "../../components/charts/chartTheme.ts";
import { SuppressedValue, useCellText } from "../../components/SuppressedValue.tsx";

export function AgingBuckets({
  buckets,
  total,
  threshold,
  info,
}: {
  buckets: Record<PendingAgeBucket, AggregateCell>;
  total: AggregateCell;
  threshold: number;
  info?: ReactNode;
}) {
  const t = useTx();
  const cellText = useCellText();
  const max = Math.max(
    1,
    ...PENDING_AGE_BUCKETS.map((b) => (buckets[b].suppressed ? 0 : (buckets[b].value ?? 0))),
  );
  const none = !total.suppressed && total.value === 0;
  return (
    <Card
      title={t("admin:timeliness.aging.title")}
      headingLevel={2}
      {...(info === undefined ? {} : { meta: info })}
    >
      <div data-testid="aging-buckets">
        <p className="mt-0 mb-3" data-testid="no-target">
          <MicroLabel className="text-muted">{t("admin:timeliness.noTarget")}</MicroLabel>
        </p>
        {none ? (
          <p className="text-muted m-0 text-[13px]">{t("admin:timeliness.aging.none")}</p>
        ) : (
          <ul
            aria-label={t("admin:timeliness.aging.label")}
            className="m-0 list-none space-y-3 p-0"
          >
            {PENDING_AGE_BUCKETS.map((b) => {
              const cell = buckets[b];
              const value = cell.suppressed ? 0 : (cell.value ?? 0);
              const label = t(`admin:timeliness.aging.bucket.${b}` as TranslationKey);
              return (
                <li key={b} className="text-[13px]" data-testid={`aging-${b}`}>
                  <div className="mb-1 flex items-baseline justify-between gap-3">
                    <span className="text-ink">{label}</span>
                    <span
                      className="text-ink tabular-nums"
                      aria-label={t("admin:timeliness.aging.share", {
                        bucket: label,
                        n: cellText(cell, threshold),
                        total: cellText(total, threshold),
                      })}
                    >
                      <SuppressedValue cell={cell} threshold={threshold} compact />
                    </span>
                  </div>
                  <div
                    className="bg-background h-1.5 overflow-hidden rounded-full"
                    aria-hidden="true"
                  >
                    <div
                      className={`h-full rounded-full ${BAR_FILL_CLASS}`}
                      style={{ width: `${Math.round((value / max) * 100)}%` }}
                    />
                  </div>
                </li>
              );
            })}
            <li className="border-border-soft flex items-baseline justify-between gap-3 border-t pt-2 text-[13px] font-semibold">
              <span>{t("admin:timeliness.aging.total")}</span>
              <SuppressedValue cell={total} threshold={threshold} />
            </li>
          </ul>
        )}
      </div>
    </Card>
  );
}
