import { useId, type ReactNode } from "react";

import { cx } from "../cx.ts";
import { MicroLabel } from "./MicroLabel.tsx";

export type CardProps = {
  title?: ReactNode;
  /** Mono uppercase label above the title (`CURRENT OBJECTIVE`). */
  eyebrow?: ReactNode;
  /** Right side of the header (meta text like "3 open", a link or a button). */
  meta?: ReactNode;
  children?: ReactNode;
  as?: "section" | "div" | "article";
  /** `muted` = the grey inner panel of ref image 2/3; `flat` removes padding. */
  variant?: "default" | "muted" | "flat";
  className?: string;
  headingLevel?: 2 | 3;
};

/** White card with 16px radius and a hairline border (ref images). */
export function Card({
  title,
  eyebrow,
  meta,
  children,
  as: Tag = "section",
  variant = "default",
  className,
  headingLevel = 2,
}: CardProps) {
  const id = useId();
  const Heading = headingLevel === 2 ? "h2" : "h3";
  const hasHeader = title !== undefined || eyebrow !== undefined || meta !== undefined;
  return (
    <Tag
      aria-labelledby={Tag === "section" && title !== undefined ? id : undefined}
      className={cx(
        "border-border-soft rounded-lg border",
        variant === "muted" ? "bg-background" : "bg-surface shadow-card",
        variant === "flat" ? "p-0" : "p-5",
        className,
      )}
    >
      {hasHeader ? (
        <div className="mb-4 flex flex-wrap items-start justify-between gap-2">
          <div className="min-w-0">
            {eyebrow === undefined ? null : <MicroLabel as="p">{eyebrow}</MicroLabel>}
            {title === undefined ? null : (
              <Heading id={id} className="text-ink text-base font-semibold">
                {title}
              </Heading>
            )}
          </div>
          {meta === undefined ? null : <div className="text-muted text-xs">{meta}</div>}
        </div>
      ) : null}
      {children}
    </Tag>
  );
}
