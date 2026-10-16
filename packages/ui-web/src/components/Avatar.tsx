import { cx } from "../cx.ts";

export type AvatarProps = {
  /** Display name; only the initials are shown (no photos — synthetic personas only). */
  name: string;
  size?: "sm" | "md" | "lg";
  /** When the name is already visible next to the avatar, hide it from screen readers. */
  decorative?: boolean;
  className?: string;
};

/** Up to two initials from a name (`"Dr. Diane N."` → `"DN"`). */
export function initialsOf(name: string): string {
  const words = name
    .replace(/[^\p{L}\p{N}\s'-]/gu, " ")
    .split(/\s+/)
    .filter((word) => word.length > 0 && !/^(dr|mr|mrs|ms)$/i.test(word));
  const first = words[0]?.[0] ?? "";
  const last = words.length > 1 ? (words[words.length - 1]?.[0] ?? "") : "";
  return `${first}${last}`.toUpperCase();
}

const SIZE: Record<NonNullable<AvatarProps["size"]>, string> = {
  sm: "size-7 text-[11px]",
  md: "size-9 text-xs",
  lg: "size-12 text-sm",
};

export function Avatar({ name, size = "md", decorative = false, className }: AvatarProps) {
  return (
    <span
      {...(decorative ? { "aria-hidden": true } : { role: "img", "aria-label": name })}
      className={cx(
        "rounded-pill bg-primary-soft text-primary-dark inline-flex shrink-0 items-center justify-center font-semibold",
        SIZE[size],
        className,
      )}
    >
      {initialsOf(name)}
    </span>
  );
}
