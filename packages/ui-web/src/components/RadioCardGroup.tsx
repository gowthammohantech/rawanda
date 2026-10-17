import { useFieldErrorText, type FieldErrorLike } from "@laif/i18n";
import { useId, type ReactNode } from "react";

import { cx } from "../cx.ts";
import { Icon } from "../icons/Icon.tsx";
import type { IconName } from "../icons/icon-data.ts";

export type RadioCardOption<V extends string = string> = {
  value: V;
  label: ReactNode;
  description?: ReactNode;
  icon?: IconName;
  disabled?: boolean;
};

export type RadioCardGroupProps<V extends string = string> = {
  /** Translated group legend. */
  legend: ReactNode;
  name?: string;
  options: readonly RadioCardOption<V>[];
  value: V | null;
  onChange: (value: V) => void;
  error?: FieldErrorLike;
  /**
   * Required group: native `required` on the radios (announced by screen readers; use it inside a
   * `noValidate` form to keep app-level validation) + a visual `*` in the legend. The legend text,
   * i.e. the group's accessible name, is unchanged. Never `aria-required` on the `<fieldset>`
   * (not allowed there — axe aria-allowed-attr).
   */
  required?: boolean;
  columns?: 1 | 2 | 3;
  className?: string;
};

/** Native radios styled as selectable cards (decision options, unit pickers). */
export function RadioCardGroup<V extends string = string>({
  legend,
  name,
  options,
  value,
  onChange,
  error,
  required = false,
  columns = 2,
  className,
}: RadioCardGroupProps<V>) {
  const autoName = useId();
  const errorId = `${autoName}-error`;
  const errorText = useFieldErrorText(error);
  return (
    <fieldset
      className={cx("m-0 min-w-0 border-0 p-0", className)}
      aria-describedby={errorText === undefined ? undefined : errorId}
    >
      <legend className="text-ink mb-2 text-[13px] font-medium">
        {legend}
        {required ? (
          <span aria-hidden="true" className="text-danger ms-1">
            *
          </span>
        ) : null}
      </legend>
      <div
        className={cx(
          "grid gap-2",
          columns === 2 && "sm:grid-cols-2",
          columns === 3 && "sm:grid-cols-3",
        )}
      >
        {options.map((option) => {
          const checked = value === option.value;
          return (
            <label
              key={option.value}
              className={cx(
                "bg-surface flex cursor-pointer items-start gap-3 rounded-md border p-3",
                "has-[:focus-visible]:outline-focus-ring has-[:focus-visible]:outline-3",
                checked
                  ? "border-primary bg-primary-soft"
                  : "border-border hover:border-primary/50",
                option.disabled === true && "cursor-not-allowed opacity-60",
              )}
            >
              <input
                type="radio"
                name={name ?? autoName}
                value={option.value}
                checked={checked}
                disabled={option.disabled}
                required={required || undefined}
                onChange={() => onChange(option.value)}
                className="accent-primary mt-0.5 size-4"
              />
              {option.icon === undefined ? null : (
                <Icon name={option.icon} size={18} className="text-primary-dark mt-0.5" />
              )}
              <span className="min-w-0">
                <span className="text-ink block text-sm font-medium">{option.label}</span>
                {option.description === undefined ? null : (
                  <span className="text-muted mt-0.5 block text-xs">{option.description}</span>
                )}
              </span>
            </label>
          );
        })}
      </div>
      {errorText === undefined ? null : (
        <p id={errorId} className="text-danger mt-1.5 flex items-center gap-1 text-xs font-medium">
          <Icon name="alert" size={14} />
          {errorText}
        </p>
      )}
    </fieldset>
  );
}
