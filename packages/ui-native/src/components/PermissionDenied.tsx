import type { ReactNode } from "react";

import { useTx } from "../i18n.ts";
import { colors } from "../tokens.ts";
import { StatePanel } from "./StatePanel.tsx";

export type PermissionDeniedProps = {
  title?: string;
  message?: string;
  /** e.g. a "Back" button. */
  action?: ReactNode;
};

/** Access-denied state; never renders any of the requested data. */
export function PermissionDenied({ title, message, action }: PermissionDeniedProps) {
  const t = useTx();
  return (
    <StatePanel
      testID="permission-denied"
      alert
      icon="lock"
      iconColor={colors.muted}
      iconBg={colors.background}
      title={title ?? t("common:state.permissionDeniedTitle")}
      message={message ?? t("common:state.permissionDenied")}
      hint={t("common:state.permissionDeniedHint")}
      actions={action ?? null}
    />
  );
}
