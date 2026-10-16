import type { ReactNode } from "react";

import { cx } from "../cx.ts";
import { useTx } from "../i18n.ts";
import { Icon } from "../icons/Icon.tsx";

export type PermissionDeniedProps = {
  title?: ReactNode;
  message?: ReactNode;
  /** e.g. a "Back to queue" link. */
  action?: ReactNode;
  className?: string;
};

/** Access-denied state; never renders any of the requested data. */
export function PermissionDenied({ title, message, action, className }: PermissionDeniedProps) {
  const t = useTx();
  return (
    <div
      role="alert"
      className={cx(
        "border-border bg-surface flex flex-col items-center justify-center gap-2 rounded-lg border px-6 py-10 text-center",
        className,
      )}
    >
      <span className="rounded-pill bg-background text-muted inline-flex size-10 items-center justify-center">
        <Icon name="lock" size={20} />
      </span>
      <p className="font-display text-ink text-base font-semibold">
        {title ?? t("common:state.permissionDeniedTitle")}
      </p>
      <p className="text-muted max-w-md text-[13px]">
        {message ?? t("common:state.permissionDenied")}
      </p>
      <p className="text-muted max-w-md text-xs">{t("common:state.permissionDeniedHint")}</p>
      {action === undefined ? null : <div className="mt-2">{action}</div>}
    </div>
  );
}
