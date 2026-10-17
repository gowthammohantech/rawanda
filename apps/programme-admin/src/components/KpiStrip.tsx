/**
 * KPI strip (ref image 1): one white card split by dividers. Each cell: mono label + (i) info,
 * the value (or `<k` + SUPPRESSED) and a sub-label. Values are `AggregateCell`s only.
 */
import type { AggregateCell, MetricDefinitionId } from "@laif/analytics";
import { cx, LoadingSkeleton } from "@laif/ui-web";
import type { ReactNode } from "react";

import { MetricInfo } from "./MetricInfo.tsx";
import { SuppressedValue } from "./SuppressedValue.tsx";

export type KpiCell = {
  id: MetricDefinitionId;
  label: string;
  value: AggregateCell;
  /** Basis count for the info popover (defaults to `value`). */
  n?: AggregateCell;
  format?: (value: number) => string;
  /** Derived value (median): a suppressed value reads "Hidden", not `<k`. */
  derived?: boolean;
  sub?: ReactNode;
};

export type KpiStripProps = {
  label: string;
  items: readonly KpiCell[];
  threshold: number;
  computedAt: string;
  rulesetVersions: readonly string[];
};

export function KpiStrip({ label, items, threshold, computedAt, rulesetVersions }: KpiStripProps) {
  return (
    <section
      aria-label={label}
      data-testid="kpi-strip"
      className="border-border-soft bg-surface shadow-card grid grid-cols-2 gap-y-4 rounded-lg border px-5 py-4 sm:grid-cols-3 xl:grid-cols-5"
    >
      {items.map((item, index) => (
        <div
          key={item.id}
          data-testid={`kpi-${item.id}`}
          className={cx(
            "min-w-0 px-4 first:ps-0",
            index > 0 && "xl:border-border-soft xl:border-s",
          )}
        >
          <div className="flex items-center gap-1">
            <h3 className="micro-label text-muted m-0 truncate font-medium">{item.label}</h3>
            <MetricInfo
              metric={item.id}
              n={item.n ?? item.value}
              threshold={threshold}
              computedAt={computedAt}
              rulesetVersions={rulesetVersions}
            />
          </div>
          <p className="text-ink m-0 mt-1 text-[28px] leading-tight font-semibold tabular-nums">
            <SuppressedValue
              cell={item.value}
              threshold={threshold}
              {...(item.format === undefined ? {} : { format: item.format })}
              derived={item.derived ?? false}
            />
          </p>
          {item.sub === undefined ? null : (
            <p className="text-muted m-0 mt-1 text-xs">{item.sub}</p>
          )}
        </div>
      ))}
    </section>
  );
}

/** Fixed-height skeleton (no layout shift while loading). */
export function KpiStripSkeleton() {
  return (
    <div className="border-border-soft bg-surface min-h-[116px] rounded-lg border px-5 py-4">
      <LoadingSkeleton variant="kpi" />
    </div>
  );
}
