import { KIGALI_UTC_OFFSET_MS } from "@laif/i18n";
import { forwardRef, type InputHTMLAttributes } from "react";

import { cx } from "../cx.ts";
import { useTx } from "../i18n.ts";
import { CONTROL_CLASS, Field, type FieldProps } from "./Field.tsx";

const WALL_TIME = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/;

const pad = (n: number, width = 2) => String(n).padStart(width, "0");

/** UTC ISO → Kigali wall time `YYYY-MM-DDTHH:mm` (Kigali is UTC+02:00, no DST). */
export function utcIsoToKigaliWallTime(iso: string | null | undefined): string {
  if (iso === null || iso === undefined || iso === "") return "";
  const ms = Date.parse(iso);
  if (Number.isNaN(ms)) return "";
  const wall = new Date(ms + KIGALI_UTC_OFFSET_MS);
  return `${pad(wall.getUTCFullYear(), 4)}-${pad(wall.getUTCMonth() + 1)}-${pad(wall.getUTCDate())}T${pad(wall.getUTCHours())}:${pad(wall.getUTCMinutes())}`;
}

/** Kigali wall time `YYYY-MM-DDTHH:mm` → UTC ISO (`…Z`); invalid → null. */
export function kigaliWallTimeToUtcIso(wall: string): string | null {
  const match = WALL_TIME.exec(wall);
  if (match === null) return null;
  const [, y, mo, d, h, mi] = match.map(Number) as [number, number, number, number, number, number];
  const ms = Date.UTC(y, mo - 1, d, h, mi) - KIGALI_UTC_OFFSET_MS;
  const check = new Date(ms + KIGALI_UTC_OFFSET_MS);
  if (check.getUTCMonth() !== mo - 1 || check.getUTCDate() !== d) return null;
  return new Date(ms).toISOString();
}

export type DateTimeInputProps = Omit<
  InputHTMLAttributes<HTMLInputElement>,
  "id" | "children" | "type" | "value" | "onChange" | "min" | "max"
> &
  Pick<FieldProps, "label" | "hint" | "error" | "required" | "id"> & {
    /** UTC ISO string (or null when empty). */
    value: string | null;
    /** Receives UTC ISO, or null when cleared/invalid. */
    onChange: (utcIso: string | null) => void;
    /** UTC ISO bounds. */
    min?: string;
    max?: string;
    fieldClassName?: string;
  };

/** `datetime-local` input showing Africa/Kigali wall time; emits UTC ISO. */
export const DateTimeInput = forwardRef<HTMLInputElement, DateTimeInputProps>(
  function DateTimeInput(
    {
      label,
      hint,
      error,
      required,
      id,
      value,
      onChange,
      min,
      max,
      fieldClassName,
      className,
      ...rest
    },
    ref,
  ) {
    const t = useTx();
    return (
      <Field
        label={label}
        hint={hint ?? t("common:ui.kigaliTime")}
        error={error}
        {...(required === undefined ? {} : { required })}
        {...(id === undefined ? {} : { id })}
        className={fieldClassName}
      >
        {(control) => (
          <input
            ref={ref}
            type="datetime-local"
            required={required}
            value={utcIsoToKigaliWallTime(value)}
            {...(min === undefined ? {} : { min: utcIsoToKigaliWallTime(min) })}
            {...(max === undefined ? {} : { max: utcIsoToKigaliWallTime(max) })}
            onChange={(event) => onChange(kigaliWallTimeToUtcIso(event.target.value))}
            className={cx(CONTROL_CLASS, "border-border tabular-nums", className)}
            {...control}
            {...rest}
          />
        )}
      </Field>
    );
  },
);
