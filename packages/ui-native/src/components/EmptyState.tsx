import type { ReactNode } from "react";

import { useTx } from "../i18n.ts";
import type { IconName } from "../icons/icon-data.ts";
import { colors } from "../tokens.ts";
import { Button } from "./Button.tsx";
import { StatePanel } from "./StatePanel.tsx";

export type EmptyStateProps = {
  /** Translated title; defaults to `common:state.emptyTitle`. */
  title?: string;
  /** Translated body; defaults to `common:state.empty`. */
  description?: string;
  icon?: IconName;
  /** Shows a "Clear filters" action. */
  onClearFilters?: () => void;
  action?: ReactNode;
};

export function EmptyState({
  title,
  description,
  icon = "clipboard",
  onClearFilters,
  action,
}: EmptyStateProps) {
  const t = useTx();
  return (
    <StatePanel
      testID="empty-state"
      dashed
      icon={icon}
      iconColor={colors.muted}
      iconBg={colors.background}
      title={title ?? t("common:state.emptyTitle")}
      message={description ?? t("common:state.empty")}
      actions={
        onClearFilters === undefined && action === undefined ? null : (
          <>
            {onClearFilters === undefined ? null : (
              <Button variant="secondary" size="sm" icon="refresh" onPress={onClearFilters}>
                {t("common:state.clearFilters")}
              </Button>
            )}
            {action ?? null}
          </>
        )
      }
    />
  );
}
