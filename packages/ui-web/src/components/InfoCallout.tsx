import type { ReactNode } from "react";

import { cx } from "../cx.ts";
import { Icon } from "../icons/Icon.tsx";
import type { IconName } from "../icons/icon-data.ts";

export type InfoCalloutProps = {
  title?: ReactNode;
  children: ReactNode;
  icon?: IconName;
  /** Soft-blue explanation card (default) or a softer teal variant. */
  tone?: "info" | "primary";
  className?: string;
};

/** Soft-blue "how to read this / suggested improvement" explanation card (ref images 1–3). */
export function InfoCallout({
  title,
  children,
  icon = "info",
  tone = "info",
  className,
}: InfoCalloutProps) {
  return (
    <aside
      className={cx(
        "text-ink flex gap-3 rounded-md border px-4 py-3 text-[13px]",
        tone === "info"
          ? "border-state-info/20 bg-state-info-soft"
          : "border-primary/20 bg-primary-soft",
        className,
      )}
    >
      <Icon
        name={icon}
        size={18}
        className={cx("mt-0.5 shrink-0", tone === "info" ? "text-state-info" : "text-primary-dark")}
      />
      <div className="min-w-0 space-y-1">
        {title === undefined ? null : (
          <p
            className={cx(
              "font-semibold",
              tone === "info" ? "text-state-info" : "text-primary-dark",
            )}
          >
            {title}
          </p>
        )}
        <div className="text-ink">{children}</div>
      </div>
    </aside>
  );
}
