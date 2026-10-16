import {
  forwardRef,
  useCallback,
  useRef,
  useState,
  type ButtonHTMLAttributes,
  type MouseEvent,
  type ReactNode,
} from "react";

import { cx } from "../cx.ts";
import { Icon } from "../icons/Icon.tsx";
import type { IconName } from "../icons/icon-data.ts";

export const BUTTON_VARIANTS = ["primary", "secondary", "ghost", "danger"] as const;
export type ButtonVariant = (typeof BUTTON_VARIANTS)[number];
export type ButtonSize = "sm" | "md";

export type ButtonProps = Omit<ButtonHTMLAttributes<HTMLButtonElement>, "onClick"> & {
  variant?: ButtonVariant;
  size?: ButtonSize;
  icon?: IconName;
  iconPosition?: "start" | "end";
  /** Disables the button, sets `aria-busy` and shows a spinner. */
  loading?: boolean;
  /**
   * May return a promise: the button then stays busy until it settles, so a second click
   * (double submit) is ignored.
   */
  onClick?: (event: MouseEvent<HTMLButtonElement>) => unknown;
  children?: ReactNode;
};

const VARIANT_CLASS: Record<ButtonVariant, string> = {
  primary:
    "bg-primary text-on-primary border-primary hover:bg-primary-dark hover:border-primary-dark",
  secondary: "bg-surface text-ink border-border hover:bg-background",
  ghost: "bg-transparent text-primary-dark border-transparent hover:bg-primary-soft",
  danger: "bg-danger text-on-primary border-danger hover:brightness-95",
};

const SIZE_CLASS: Record<ButtonSize, string> = {
  sm: "min-h-8 px-3 text-[13px] gap-1.5",
  md: "min-h-10 px-4 text-sm gap-2",
};

function isPromiseLike(value: unknown): value is PromiseLike<unknown> {
  return (
    typeof value === "object" &&
    value !== null &&
    typeof (value as { then?: unknown }).then === "function"
  );
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  {
    variant = "primary",
    size = "md",
    icon,
    iconPosition = "start",
    loading = false,
    disabled = false,
    onClick,
    className,
    children,
    type = "button",
    ...rest
  },
  ref,
) {
  const lock = useRef(false);
  const [pending, setPending] = useState(false);
  const busy = loading || pending;

  const handleClick = useCallback(
    (event: MouseEvent<HTMLButtonElement>) => {
      if (busy || lock.current || disabled) {
        event.preventDefault();
        return;
      }
      const result = onClick?.(event);
      if (isPromiseLike(result)) {
        lock.current = true;
        setPending(true);
        const release = () => {
          lock.current = false;
          setPending(false);
        };
        result.then(release, release);
      }
    },
    [busy, disabled, onClick],
  );

  return (
    <button
      ref={ref}
      type={type}
      disabled={disabled || busy}
      aria-busy={busy || undefined}
      onClick={handleClick}
      className={cx(
        "target-min inline-flex items-center justify-center rounded-sm border font-medium whitespace-nowrap transition-colors",
        "disabled:cursor-not-allowed disabled:opacity-60",
        VARIANT_CLASS[variant],
        SIZE_CLASS[size],
        className,
      )}
      {...rest}
    >
      {busy ? (
        <span
          aria-hidden="true"
          className="size-4 animate-spin rounded-full border-2 border-current border-t-transparent"
        />
      ) : icon !== undefined && iconPosition === "start" ? (
        <Icon name={icon} size={size === "sm" ? 16 : 18} />
      ) : null}
      {children === undefined ? null : <span>{children}</span>}
      {!busy && icon !== undefined && iconPosition === "end" ? (
        <Icon name={icon} size={size === "sm" ? 16 : 18} />
      ) : null}
    </button>
  );
});
