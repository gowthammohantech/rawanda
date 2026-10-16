import { forwardRef, type InputHTMLAttributes, type ReactNode } from "react";

import { cx } from "../cx.ts";
import { CONTROL_CLASS, Field, type FieldProps } from "./Field.tsx";

export type NumberInputProps = Omit<
  InputHTMLAttributes<HTMLInputElement>,
  "id" | "children" | "type"
> &
  Pick<FieldProps, "label" | "hint" | "error" | "required" | "id"> & {
    /** Unit suffix slot (e.g. "mmHg" text or a unit `<select>`). Always visible. */
    unit?: ReactNode;
    fieldClassName?: string;
  };

/**
 * Decimal text input (`inputMode="decimal"`, accepts `,` or `.`; apps parse with
 * `parseDecimal`) with a unit suffix slot.
 */
export const NumberInput = forwardRef<HTMLInputElement, NumberInputProps>(function NumberInput(
  { label, hint, error, required, id, unit, fieldClassName, className, ...rest },
  ref,
) {
  return (
    <Field
      label={label}
      hint={hint}
      error={error}
      {...(required === undefined ? {} : { required })}
      {...(id === undefined ? {} : { id })}
      className={fieldClassName}
    >
      {(control) => (
        <div className="flex items-stretch">
          <input
            ref={ref}
            type="text"
            inputMode="decimal"
            autoComplete="off"
            required={required}
            className={cx(
              CONTROL_CLASS,
              "border-border tabular-nums",
              unit !== undefined && "rounded-e-none",
              className,
            )}
            {...control}
            {...rest}
          />
          {unit === undefined ? null : (
            <span className="border-border bg-background text-muted inline-flex items-center rounded-e-sm border border-s-0 px-3 text-[13px]">
              {unit}
            </span>
          )}
        </div>
      )}
    </Field>
  );
});

/** Parses "7,8" or "7.8" → 7.8; empty/invalid → null. */
export function parseDecimal(raw: string): number | null {
  const normalised = raw.trim().replace(",", ".");
  if (normalised === "" || !/^-?\d*\.?\d+$/.test(normalised)) return null;
  const value = Number(normalised);
  return Number.isFinite(value) ? value : null;
}
