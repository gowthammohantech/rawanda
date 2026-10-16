import { forwardRef, type SelectHTMLAttributes } from "react";

import { cx } from "../cx.ts";
import { Icon } from "../icons/Icon.tsx";
import { CONTROL_CLASS, Field, type FieldProps } from "./Field.tsx";

export type SelectOption = { value: string; label: string; disabled?: boolean };

export type SelectProps = Omit<SelectHTMLAttributes<HTMLSelectElement>, "id" | "children"> &
  Pick<FieldProps, "label" | "hint" | "error" | "required" | "id"> & {
    options: readonly SelectOption[];
    /** Translated placeholder rendered as an empty first option. */
    placeholder?: string;
    fieldClassName?: string;
  };

/** Native select (best keyboard + screen-reader support) styled like ref image 2. */
export const Select = forwardRef<HTMLSelectElement, SelectProps>(function Select(
  { label, hint, error, required, id, options, placeholder, fieldClassName, className, ...rest },
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
        <div className="relative">
          <select
            ref={ref}
            required={required}
            className={cx(CONTROL_CLASS, "border-border appearance-none pe-9", className)}
            {...control}
            {...rest}
          >
            {placeholder === undefined ? null : <option value="">{placeholder}</option>}
            {options.map((option) => (
              <option key={option.value} value={option.value} disabled={option.disabled}>
                {option.label}
              </option>
            ))}
          </select>
          <Icon
            name="chevron-down"
            size={16}
            className="text-muted pointer-events-none absolute end-3 top-1/2 -translate-y-1/2"
          />
        </div>
      )}
    </Field>
  );
});
