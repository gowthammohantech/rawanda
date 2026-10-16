import * as Tooltip from "@radix-ui/react-tooltip";
import { forwardRef, type ButtonHTMLAttributes, type ReactNode } from "react";

import { cx } from "../cx.ts";
import { useTx, type TranslationKey, type TranslationValues } from "../i18n.ts";
import { Icon } from "../icons/Icon.tsx";
import type { IconName } from "../icons/icon-data.ts";

export type IconButtonProps = Omit<
  ButtonHTMLAttributes<HTMLButtonElement>,
  "aria-label" | "children"
> & {
  icon: IconName;
  /** Required: the accessible name (and tooltip) of an icon-only control. */
  labelKey: TranslationKey;
  labelValues?: TranslationValues;
  variant?: "ghost" | "outline";
  /** Small status dot (e.g. unread notifications); announced via `badgeLabelKey`. */
  badge?: boolean;
  badgeLabelKey?: TranslationKey;
  tooltip?: boolean;
  /** Extra content inside the button (rare; e.g. a count). */
  adornment?: ReactNode;
};

export const IconButton = forwardRef<HTMLButtonElement, IconButtonProps>(function IconButton(
  {
    icon,
    labelKey,
    labelValues,
    variant = "ghost",
    badge = false,
    badgeLabelKey,
    tooltip = true,
    adornment,
    className,
    type = "button",
    ...rest
  },
  ref,
) {
  const t = useTx();
  const label = t(labelKey, labelValues);
  const fullLabel = badge && badgeLabelKey !== undefined ? `${label}. ${t(badgeLabelKey)}` : label;
  const button = (
    <button
      ref={ref}
      type={type}
      aria-label={fullLabel}
      className={cx(
        "target-min rounded-pill text-ink relative inline-flex items-center justify-center transition-colors",
        "disabled:cursor-not-allowed disabled:opacity-60",
        variant === "outline"
          ? "border-border bg-surface hover:bg-background border"
          : "hover:bg-surface/70",
        "size-10",
        className,
      )}
      {...rest}
    >
      <Icon name={icon} size={20} />
      {badge ? (
        <span
          aria-hidden="true"
          data-testid="icon-button-badge"
          className="rounded-pill bg-danger ring-surface absolute top-2 right-2 size-2 ring-2"
        />
      ) : null}
      {adornment}
    </button>
  );
  if (!tooltip) return button;
  return (
    <Tooltip.Provider delayDuration={400}>
      <Tooltip.Root>
        <Tooltip.Trigger asChild>{button}</Tooltip.Trigger>
        <Tooltip.Portal>
          <Tooltip.Content
            sideOffset={6}
            className="bg-ink text-on-primary shadow-raised z-50 rounded-sm px-2 py-1 text-xs"
          >
            {label}
          </Tooltip.Content>
        </Tooltip.Portal>
      </Tooltip.Root>
    </Tooltip.Provider>
  );
});
