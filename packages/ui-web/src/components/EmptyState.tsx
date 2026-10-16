import type { ReactNode } from "react";

import { cx } from "../cx.ts";
import { useTx } from "../i18n.ts";
import { Icon } from "../icons/Icon.tsx";
import type { IconName } from "../icons/icon-data.ts";
import { Button } from "./Button.tsx";

export type EmptyStateProps = {
  /** Translated title; defaults to `common:state.emptyTitle`. */
  title?: ReactNode;
  /** Translated body; defaults to `common:state.empty`. */
  description?: ReactNode;
  icon?: IconName;
  /** Shows a "Clear filters" action. */
  onClearFilters?: () => void;
  /** Any other action. */
  action?: ReactNode;
  className?: string;
};

export function EmptyState({
  title,
  description,
  icon = "clipboard",
  onClearFilters,
  action,
  className,
}: EmptyStateProps) {
  const t = useTx();
  return (
    <div
      className={cx(
        "border-border bg-surface flex flex-col items-center justify-center gap-2 rounded-lg border border-dashed px-6 py-10 text-center",
        className,
      )}
    >
      <span className="rounded-pill bg-background text-muted inline-flex size-10 items-center justify-center">
        <Icon name={icon} size={20} />
      </span>
      <p className="font-display text-ink text-base font-semibold">
        {title ?? t("common:state.emptyTitle")}
      </p>
      <p className="text-muted max-w-md text-[13px]">{description ?? t("common:state.empty")}</p>
      {onClearFilters === undefined && action === undefined ? null : (
        <div className="mt-2 flex flex-wrap justify-center gap-2">
          {onClearFilters === undefined ? null : (
            <Button variant="secondary" size="sm" icon="refresh" onClick={onClearFilters}>
              {t("common:state.clearFilters")}
            </Button>
          )}
          {action}
        </div>
      )}
    </div>
  );
}
