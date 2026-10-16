import { forwardRef, type TextareaHTMLAttributes } from "react";

import { cx } from "../cx.ts";
import { useTx } from "../i18n.ts";
import { CONTROL_CLASS, Field, type FieldProps } from "./Field.tsx";

export type TextareaProps = Omit<
  TextareaHTMLAttributes<HTMLTextAreaElement>,
  "id" | "children" | "value"
> &
  Pick<FieldProps, "label" | "hint" | "error" | "required" | "id"> & {
    value?: string;
    /** Shows a live "n of max characters" counter (requires `maxLength`). */
    showCount?: boolean;
    fieldClassName?: string;
  };

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaProps>(function Textarea(
  {
    label,
    hint,
    error,
    required,
    id,
    showCount = true,
    maxLength,
    value,
    fieldClassName,
    className,
    rows = 4,
    ...rest
  },
  ref,
) {
  const t = useTx();
  const count = value?.length ?? 0;
  const counter =
    showCount && maxLength !== undefined ? (
      <span className="text-muted text-xs tabular-nums" aria-live="polite">
        {t("common:ui.charCount", { count, max: maxLength })}
      </span>
    ) : undefined;
  return (
    <Field
      label={label}
      hint={hint}
      error={error}
      {...(required === undefined ? {} : { required })}
      {...(id === undefined ? {} : { id })}
      aside={counter}
      className={fieldClassName}
    >
      {(control) => (
        <textarea
          ref={ref}
          rows={rows}
          required={required}
          maxLength={maxLength}
          {...(value === undefined ? {} : { value })}
          className={cx(CONTROL_CLASS, "border-border resize-y", className)}
          {...control}
          {...rest}
        />
      )}
    </Field>
  );
});
