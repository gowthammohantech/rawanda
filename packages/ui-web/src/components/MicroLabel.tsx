import type { ReactNode } from "react";

import { cx } from "../cx.ts";
import { TONE_TEXT_CLASS, type Tone } from "./tone.ts";

export type MicroLabelProps = {
  children: ReactNode;
  as?: "span" | "p" | "h2" | "h3" | "h4" | "dt" | "div";
  tone?: Tone;
  className?: string;
  id?: string;
};

/** Monospace uppercase micro-label (`PRIMARY CONSTRAINT`, `NEEDS YOU`). */
export function MicroLabel({
  children,
  as: Tag = "span",
  tone = "neutral",
  className,
  id,
}: MicroLabelProps) {
  return (
    <Tag id={id} className={cx("micro-label font-medium", TONE_TEXT_CLASS[tone], className)}>
      {children}
    </Tag>
  );
}
