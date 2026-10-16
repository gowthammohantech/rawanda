import { useId, useState, type ReactNode } from "react";

import { cx } from "../cx.ts";
import { useTx } from "../i18n.ts";
import { Icon } from "../icons/Icon.tsx";

export type ExpandableRowProps = {
  title: ReactNode;
  subtitle?: ReactNode;
  /** Leading avatar/icon. */
  leading?: ReactNode;
  /** Trailing summary (chips, time) shown in the collapsed row. */
  trailing?: ReactNode;
  /** Details revealed when expanded. */
  children: ReactNode;
  defaultExpanded?: boolean;
  expanded?: boolean;
  onExpandedChange?: (expanded: boolean) => void;
  /** Highlight (ref image 6 conflict row). */
  tone?: "default" | "danger" | "warning";
  headingLevel?: 3 | 4;
  className?: string;
};

/** Expandable list row with a disclosure button (`aria-expanded`). */
export function ExpandableRow({
  title,
  subtitle,
  leading,
  trailing,
  children,
  defaultExpanded = false,
  expanded,
  onExpandedChange,
  tone = "default",
  headingLevel = 3,
  className,
}: ExpandableRowProps) {
  const t = useTx();
  const panelId = useId();
  const [internal, setInternal] = useState(defaultExpanded);
  const isOpen = expanded ?? internal;
  const Heading = headingLevel === 3 ? "h3" : "h4";
  const toggle = () => {
    const next = !isOpen;
    if (expanded === undefined) setInternal(next);
    onExpandedChange?.(next);
  };
  return (
    <div
      className={cx(
        "bg-surface rounded-md border",
        tone === "danger" && "border-risk-danger/30",
        tone === "warning" && "border-risk-warning/30",
        tone === "default" && (isOpen ? "border-border shadow-raised" : "border-transparent"),
        className,
      )}
    >
      <Heading className="m-0 font-sans text-sm">
        <button
          type="button"
          aria-expanded={isOpen}
          aria-controls={panelId}
          onClick={toggle}
          className="hover:bg-background flex w-full items-center gap-3 rounded-md px-3 py-3 text-start"
        >
          {leading}
          <span className="min-w-0 flex-1">
            <span className="text-ink block font-semibold">{title}</span>
            {subtitle === undefined ? null : (
              <span className="text-muted block truncate text-[13px] font-normal">{subtitle}</span>
            )}
          </span>
          {trailing === undefined ? null : (
            <span className="hidden shrink-0 items-center gap-3 font-normal sm:flex">
              {trailing}
            </span>
          )}
          <Icon
            name={isOpen ? "chevron-up" : "chevron-down"}
            size={18}
            className="text-muted shrink-0"
          />
          <span className="sr-only">
            {isOpen ? t("common:ui.collapse") : t("common:ui.expand")}
          </span>
        </button>
      </Heading>
      <div id={panelId} hidden={!isOpen} className="border-border-soft border-t px-3 py-4">
        {isOpen ? children : null}
      </div>
    </div>
  );
}
