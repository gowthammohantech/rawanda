import { forwardRef, type InputHTMLAttributes, type ReactNode } from "react";

import { cx } from "../cx.ts";
import { CONTROL_CLASS, Field, type FieldProps } from "./Field.tsx";

export type TextInputProps = Omit<InputHTMLAttributes<HTMLInputElement>, "id" | "children"> &
  Pick<FieldProps, "label" | "hint" | "error" | "required" | "id"> & {
    fieldClassName?: string;
    aside?: ReactNode;
  };

export const TextInput = forwardRef<HTMLInputElement, TextInputProps>(function TextInput(
  { label, hint, error, required, id, fieldClassName, aside, className, type = "text", ...rest },
  ref,
) {
  return (
    <Field
      label={label}
      hint={hint}
      error={error}
      {...(required === undefined ? {} : { required })}
      {...(id === undefined ? {} : { id })}
      aside={aside}
      className={fieldClassName}
    >
      {(control) => (
        <input
          ref={ref}
          type={type}
          required={required}
          className={cx(CONTROL_CLASS, "border-border", className)}
          {...control}
          {...rest}
        />
      )}
    </Field>
  );
});
