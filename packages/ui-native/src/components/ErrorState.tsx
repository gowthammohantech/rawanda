import { isErrorCode } from "@laif/contracts";
import type { ReactNode } from "react";

import { useTx } from "../i18n.ts";
import { colors } from "../tokens.ts";
import { Button } from "./Button.tsx";
import { StatePanel } from "./StatePanel.tsx";

export type ErrorStateProps = {
  /** `RepositoryError.code` (or any code string); shown as "Error code: …". */
  code?: string;
  title?: string;
  /** Defaults to `common:error.<code>` or `common:state.error`. */
  message?: string;
  /** Shows a "Try again" button. May return a promise (button stays busy). */
  onRetry?: () => unknown;
  action?: ReactNode;
};

export function ErrorState({ code, title, message, onRetry, action }: ErrorStateProps) {
  const t = useTx();
  const defaultMessage =
    code !== undefined && isErrorCode(code) ? t(`common:error.${code}`) : t("common:state.error");
  const offline = code === "OFFLINE";
  return (
    <StatePanel
      testID="error-state"
      alert
      icon={offline ? "wifi-off" : "alert"}
      iconColor={colors.danger}
      iconBg={colors.dangerSoft}
      title={title ?? (offline ? t("common:state.offlineTitle") : t("common:state.errorTitle"))}
      message={message ?? defaultMessage}
      hint={code === undefined ? undefined : t("common:state.errorCode", { code })}
      actions={
        onRetry === undefined && action === undefined ? null : (
          <>
            {onRetry === undefined ? null : (
              <Button variant="secondary" size="sm" icon="refresh" onPress={() => onRetry()}>
                {t("common:actions.retry")}
              </Button>
            )}
            {action ?? null}
          </>
        )
      }
    />
  );
}
