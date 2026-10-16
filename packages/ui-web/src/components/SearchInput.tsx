import { forwardRef, useId, type InputHTMLAttributes } from "react";

import { cx } from "../cx.ts";
import { Icon } from "../icons/Icon.tsx";

export type SearchInputProps = Omit<InputHTMLAttributes<HTMLInputElement>, "type" | "onChange"> & {
  /** Accessible label (already translated); visually hidden. */
  label: string;
  value: string;
  onValueChange: (value: string) => void;
  /** Keyboard hint chip (e.g. "⌘K"); its translated description goes in `shortcutLabel`. */
  shortcut?: string;
  shortcutLabel?: string;
};

export const SearchInput = forwardRef<HTMLInputElement, SearchInputProps>(function SearchInput(
  { label, value, onValueChange, shortcut, shortcutLabel, className, id, ...rest },
  ref,
) {
  const autoId = useId();
  const inputId = id ?? autoId;
  const hintId = `${inputId}-hint`;
  return (
    <div
      className={cx(
        "rounded-pill border-border-soft bg-surface/80 flex h-10 w-full items-center gap-2 border px-3 text-sm",
        "focus-within:border-primary focus-within:outline-focus-ring focus-within:outline-3",
        className,
      )}
    >
      <label htmlFor={inputId} className="sr-only">
        {label}
      </label>
      <Icon name="search" size={18} className="text-muted shrink-0" />
      <input
        ref={ref}
        id={inputId}
        type="search"
        value={value}
        onChange={(event) => onValueChange(event.target.value)}
        aria-describedby={shortcutLabel === undefined ? undefined : hintId}
        className="text-ink placeholder:text-subtle min-w-0 flex-1 bg-transparent outline-none"
        {...rest}
      />
      {shortcut === undefined ? null : (
        <kbd
          aria-hidden="true"
          className="bg-background text-muted hidden rounded-sm px-1.5 py-0.5 font-mono text-[10px] sm:inline"
        >
          {shortcut}
        </kbd>
      )}
      {shortcutLabel === undefined ? null : (
        <span id={hintId} className="sr-only">
          {shortcutLabel}
        </span>
      )}
    </div>
  );
});
