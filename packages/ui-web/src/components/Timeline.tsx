import type { ReactNode } from "react";

import { cx } from "../cx.ts";

export type TimelineItem = {
  id: string;
  /** Already-formatted short date for the rail ("OCT 2"). */
  dateLabel: string;
  /** ISO timestamp for `<time dateTime>` (optional). */
  dateTime?: string;
  title: ReactNode;
  description?: ReactNode;
  /** Trailing chip (e.g. NEEDS YOU StatusChip). */
  chip?: ReactNode;
  /** Extra content (actor line, links). */
  meta?: ReactNode;
};

export type TimelineProps = {
  items: readonly TimelineItem[];
  /** Accessible name (already translated). */
  label: string;
  className?: string;
};

/** Date-rail activity list (ref image 5) for audit and follow-up timelines. */
export function Timeline({ items, label, className }: TimelineProps) {
  return (
    <ol
      aria-label={label}
      className={cx("divide-border-soft m-0 list-none divide-y p-0", className)}
    >
      {items.map((item) => (
        <li key={item.id} className="grid grid-cols-[64px_1fr] gap-4 py-4 first:pt-0 last:pb-0">
          <time
            {...(item.dateTime === undefined ? {} : { dateTime: item.dateTime })}
            className="micro-label text-muted pt-0.5"
          >
            {item.dateLabel}
          </time>
          <div className="min-w-0">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <p className="text-ink font-semibold">{item.title}</p>
              {item.chip}
            </div>
            {item.description === undefined ? null : (
              <div className="text-muted mt-1 text-[13px]">{item.description}</div>
            )}
            {item.meta === undefined ? null : (
              <div className="text-muted mt-1.5 text-xs">{item.meta}</div>
            )}
          </div>
        </li>
      ))}
    </ol>
  );
}
