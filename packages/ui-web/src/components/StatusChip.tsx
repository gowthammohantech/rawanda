import type { ReactNode } from "react";

import { cx } from "../cx.ts";
import { Icon } from "../icons/Icon.tsx";
import type { IconName } from "../icons/icon-data.ts";
import { TONE_CHIP_CLASS, TONE_ICON, type Tone } from "./tone.ts";

export type StatusChipProps = {
  tone?: Tone;
  /** Visible, translated text — required: urgency is never colour-only. */
  children: ReactNode;
  /** Overrides the tone's default icon. */
  icon?: IconName;
  className?: string;
};

function isEmpty(children: ReactNode): boolean {
  if (children === null || children === undefined || typeof children === "boolean") return true;
  if (typeof children === "string") return children.trim() === "";
  if (Array.isArray(children)) return children.every((child: ReactNode) => isEmpty(child));
  return false;
}

/** Pill status badge in mono caps; ALWAYS icon + text (throws on empty text). */
export function StatusChip({ tone = "neutral", children, icon, className }: StatusChipProps) {
  if (isEmpty(children)) {
    throw new Error("StatusChip requires visible text: status is never conveyed by colour only.");
  }
  return (
    <span
      data-tone={tone}
      className={cx(
        "micro-label rounded-pill inline-flex w-max max-w-full items-center gap-1.5 border px-2 py-0.5 font-medium",
        TONE_CHIP_CLASS[tone],
        className,
      )}
    >
      <Icon name={icon ?? TONE_ICON[tone]} size={12} strokeWidth={2.2} className="shrink-0" />
      <span className="truncate">{children}</span>
    </span>
  );
}
