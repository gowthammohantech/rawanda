/**
 * Pure-CSS horizontal bars (ref image 1 "Most asked topics") — faster and more accessible than
 * an SVG chart. Rows are links (optional); suppressed rows show `<k` and an empty bar.
 */
import type { AggregateCell } from "@laif/analytics";
import { cx } from "@laif/ui-web";
import type { ReactNode } from "react";
import { Link } from "react-router";

import { SuppressedValue } from "../SuppressedValue.tsx";
import { BAR_FILL_CLASS } from "./chartTheme.ts";

export type HBarRow = {
  id: string;
  label: string;
  value: AggregateCell;
  /** Extra text after the value (already translated). */
  secondary?: ReactNode;
  to?: string;
  /** Accessible link name (defaults to the label). */
  linkLabel?: string;
};

export type HBarListProps = {
  label: string;
  rows: readonly HBarRow[];
  threshold: number;
};

export function HBarList({ label, rows, threshold }: HBarListProps) {
  const max = Math.max(1, ...rows.map((r) => (r.value.suppressed ? 0 : (r.value.value ?? 0))));
  return (
    <ul aria-label={label} className="m-0 list-none space-y-3 p-0">
      {rows.map((row) => {
        const value = row.value.suppressed ? 0 : (row.value.value ?? 0);
        const pct = Math.round((value / max) * 100);
        const name =
          row.to === undefined ? (
            <span className="text-ink">{row.label}</span>
          ) : (
            <Link
              to={row.to}
              aria-label={row.linkLabel ?? row.label}
              className="text-primary-dark hover:underline"
            >
              {row.label}
            </Link>
          );
        return (
          <li key={row.id} className="text-[13px]">
            <div className="mb-1 flex items-baseline justify-between gap-3">
              {name}
              <span className="text-ink tabular-nums">
                <SuppressedValue cell={row.value} threshold={threshold} compact />
                {row.secondary === undefined ? null : (
                  <span className="text-muted ms-2 text-xs">{row.secondary}</span>
                )}
              </span>
            </div>
            <div className="bg-background h-2 overflow-hidden rounded-full" aria-hidden="true">
              <div
                className={cx("h-full rounded-full", BAR_FILL_CLASS)}
                style={{ width: `${pct}%` }}
              />
            </div>
          </li>
        );
      })}
    </ul>
  );
}
