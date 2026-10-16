import type { ReactNode } from "react";

import { cx } from "../cx.ts";

export type KeyValueItem = { id?: string; label: ReactNode; value: ReactNode };

export type KeyValueListProps = {
  items: readonly KeyValueItem[];
  /** `rows` = label left / value right with dividers (ref image 3 "Account"); `stacked` = label above. */
  layout?: "rows" | "stacked";
  className?: string;
};

export function KeyValueList({ items, layout = "rows", className }: KeyValueListProps) {
  return (
    <dl className={cx("m-0", layout === "rows" && "divide-border-soft divide-y", className)}>
      {items.map((item, index) => (
        <div
          key={item.id ?? index}
          className={cx(
            layout === "rows"
              ? "flex items-baseline justify-between gap-4 py-2.5 first:pt-0 last:pb-0"
              : "py-1.5",
          )}
        >
          <dt className="text-muted text-[13px]">{item.label}</dt>
          <dd className={cx("text-ink m-0 text-sm", layout === "rows" && "text-end font-medium")}>
            {item.value}
          </dd>
        </div>
      ))}
    </dl>
  );
}
