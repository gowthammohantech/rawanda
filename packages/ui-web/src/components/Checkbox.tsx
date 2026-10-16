import { forwardRef, useId, type InputHTMLAttributes, type ReactNode } from "react";

import { cx } from "../cx.ts";

export type CheckboxProps = Omit<InputHTMLAttributes<HTMLInputElement>, "type" | "children"> & {
  label: ReactNode;
  description?: ReactNode;
};

/** Native checkbox with label and optional description (ref image 2 "Next action"). */
export const Checkbox = forwardRef<HTMLInputElement, CheckboxProps>(function Checkbox(
  { label, description, id, className, ...rest },
  ref,
) {
  const autoId = useId();
  const inputId = id ?? autoId;
  const descId = `${inputId}-desc`;
  return (
    <div className={cx("flex items-start gap-3", className)}>
      <input
        ref={ref}
        id={inputId}
        type="checkbox"
        aria-describedby={description === undefined ? undefined : descId}
        className="accent-primary mt-0.5 size-[18px] shrink-0 rounded-sm"
        {...rest}
      />
      <div className="min-w-0">
        <label htmlFor={inputId} className="text-ink text-sm font-medium">
          {label}
        </label>
        {description === undefined ? null : (
          <p id={descId} className="text-muted text-xs">
            {description}
          </p>
        )}
      </div>
    </div>
  );
});
