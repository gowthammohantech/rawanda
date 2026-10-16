import type { ReactNode } from "react";

export type VisuallyHiddenProps = { children?: ReactNode; as?: "span" | "div" | "p" | "h2" };

/** Content for screen readers only (Tailwind `sr-only`). */
export function VisuallyHidden({ children, as: Tag = "span" }: VisuallyHiddenProps) {
  return <Tag className="sr-only">{children}</Tag>;
}
