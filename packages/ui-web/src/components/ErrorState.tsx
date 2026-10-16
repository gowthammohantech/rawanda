import { isErrorCode } from "@laif/contracts";
import type { ReactNode } from "react";

import { cx } from "../cx.ts";
import { useTx } from "../i18n.ts";
import { Icon } from "../icons/Icon.tsx";
import { Button } from "./Button.tsx";

export type ErrorStateProps = {
  /** `RepositoryError.code` (or any code string); shown as "Error code: …". */
  code?: string;
  /** Translated title; defaults to `common:state.errorTitle`. */
  title?: ReactNode;
  /** Translated message; defaults to `common:error.<code>` or `common:state.error`. */
  message?: ReactNode;
  /** Shows a "Try again" button. May return a promise (button stays busy). */
  onRetry?: () => unknown;
  action?: ReactNode;
  className?: string;
};

export function ErrorState({ code, title, message, onRetry, action, className }: ErrorStateProps) {
  const t = useTx();
  const defaultMessage =
    code !== undefined && isErrorCode(code) ? t(`common:error.${code}`) : t("common:state.error");
  return (
    <div
      role="alert"
      className={cx(
        "border-risk-danger/20 bg-surface flex flex-col items-center justify-center gap-2 rounded-lg border px-6 py-10 text-center",
        className,
      )}
    >
      <span className="rounded-pill bg-risk-danger-soft text-risk-danger inline-flex size-10 items-center justify-center">
        <Icon name={code === "OFFLINE" ? "wifi-off" : "alert"} size={20} />
      </span>
      <p className="font-display text-ink text-base font-semibold">
        {title ??
          (code === "OFFLINE" ? t("common:state.offlineTitle") : t("common:state.errorTitle"))}
      </p>
      <p className="text-muted max-w-md text-[13px]">{message ?? defaultMessage}</p>
      {code === undefined ? null : (
        <p className="micro-label text-muted">{t("common:state.errorCode", { code })}</p>
      )}
      {onRetry === undefined && action === undefined ? null : (
        <div className="mt-2 flex flex-wrap justify-center gap-2">
          {onRetry === undefined ? null : (
            <Button variant="secondary" size="sm" icon="refresh" onClick={() => onRetry()}>
              {t("common:actions.retry")}
            </Button>
          )}
          {action}
        </div>
      )}
    </div>
  );
}
