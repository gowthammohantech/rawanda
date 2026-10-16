import { useFieldErrorText, type FieldErrorLike } from "@laif/i18n";
import { useId, type ReactNode } from "react";

import { cx } from "../cx.ts";
import { useTx } from "../i18n.ts";
import { Icon } from "../icons/Icon.tsx";

/** Props a control must spread to be wired to its label, hint and error. */
export type FieldControlProps = {
  id: string;
  "aria-describedby"?: string;
  "aria-invalid"?: true;
  "aria-required"?: true;
};

export type FieldProps = {
  /** Translated label. */
  label: ReactNode;
  /** Translated hint below the control. */
  hint?: ReactNode;
  /**
   * A react-hook-form `FieldError`, a parsed message or a raw `vMsg` string from
   * `@laif/contracts` — translated via `useFieldErrorText`.
   */
  error?: FieldErrorLike;
  required?: boolean;
  /** Extra text right of the label (e.g. a character counter). */
  aside?: ReactNode;
  id?: string | undefined;
  className?: string | undefined;
  children: (control: FieldControlProps) => ReactNode;
};

export const CONTROL_CLASS =
  "w-full rounded-sm border bg-surface px-3 py-2 text-sm text-ink placeholder:text-subtle disabled:bg-background disabled:text-muted aria-[invalid=true]:border-danger";

/** Label + control + hint + translated validation error, wired with `aria-describedby`. */
export function Field({
  label,
  hint,
  error,
  required = false,
  aside,
  id,
  className,
  children,
}: FieldProps) {
  const t = useTx();
  const autoId = useId();
  const controlId = id ?? autoId;
  const hintId = `${controlId}-hint`;
  const errorId = `${controlId}-error`;
  const errorText = useFieldErrorText(error);
  const describedBy = [hint === undefined ? null : hintId, errorText === undefined ? null : errorId]
    .filter((value): value is string => value !== null)
    .join(" ");
  const control: FieldControlProps = {
    id: controlId,
    ...(describedBy === "" ? {} : { "aria-describedby": describedBy }),
    ...(errorText === undefined ? {} : { "aria-invalid": true as const }),
    ...(required ? { "aria-required": true as const } : {}),
  };
  return (
    <div className={cx("flex flex-col gap-1.5", className)}>
      <div className="flex items-baseline justify-between gap-2">
        <label htmlFor={controlId} className="text-ink text-[13px] font-medium">
          {label}
          {required ? (
            <span className="text-danger ms-1">
              <span aria-hidden="true">*</span>
              <span className="sr-only">{t("common:ui.required")}</span>
            </span>
          ) : null}
        </label>
        {aside}
      </div>
      {children(control)}
      {hint === undefined ? null : (
        <p id={hintId} className="text-muted text-xs">
          {hint}
        </p>
      )}
      {errorText === undefined ? null : (
        <p id={errorId} className="text-danger flex items-center gap-1 text-xs font-medium">
          <Icon name="alert" size={14} />
          {errorText}
        </p>
      )}
    </div>
  );
}
