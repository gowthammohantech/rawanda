import { useId, type ReactNode } from "react";

import { cx } from "../cx.ts";
import { useTx } from "../i18n.ts";
import { Button } from "./Button.tsx";

export type FilterOption<V extends string = string> = {
  value: V;
  /** Translated option label. */
  label: string;
  count?: number;
};

/** One filter: a segmented chip group or a native select, keyed by a field of the state. */
export type FilterDefinition<F extends Record<string, string>> = {
  [K in keyof F & string]: {
    id: K;
    kind: "segmented" | "select";
    /** Translated filter label (visible for selects, group name for chips). */
    label: string;
    options: readonly FilterOption<F[K]>[];
    disabled?: boolean;
  };
}[keyof F & string];

export type FilterBarProps<F extends Record<string, string>> = {
  filters: readonly FilterDefinition<F>[];
  value: F;
  onChange: (next: F) => void;
  /** When set, announced politely ("12 results") after every change. */
  resultCount?: number;
  /** Shows a "Clear filters" button. */
  onReset?: () => void;
  /** Extra controls (e.g. a SearchInput). */
  children?: ReactNode;
  className?: string;
};

/** Chip/segmented filters + selects with typed state and an `aria-live` result count. */
export function FilterBar<F extends Record<string, string>>({
  filters,
  value,
  onChange,
  resultCount,
  onReset,
  children,
  className,
}: FilterBarProps<F>) {
  const t = useTx();
  const baseId = useId();
  const set = (id: keyof F & string, next: string) => onChange({ ...value, [id]: next });

  return (
    <div
      className={cx(
        "border-border-soft bg-surface flex flex-wrap items-end gap-3 rounded-lg border p-3",
        className,
      )}
    >
      {children}
      {filters.map((filter) => {
        const id = `${baseId}-${filter.id}`;
        if (filter.kind === "select") {
          return (
            <div key={filter.id} className="flex flex-col gap-1">
              <label htmlFor={id} className="text-muted text-xs">
                {filter.label}
              </label>
              <select
                id={id}
                value={value[filter.id]}
                disabled={filter.disabled}
                onChange={(event) => set(filter.id, event.target.value)}
                className="target-min border-border bg-surface text-ink h-9 rounded-sm border px-2 text-sm"
              >
                {filter.options.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.count === undefined
                      ? option.label
                      : `${option.label} (${option.count})`}
                  </option>
                ))}
              </select>
            </div>
          );
        }
        return (
          <div key={filter.id} role="group" aria-labelledby={id} className="flex flex-col gap-1">
            <span id={id} className="text-muted text-xs">
              {filter.label}
            </span>
            <div className="rounded-pill bg-background flex flex-wrap gap-1 p-1">
              {filter.options.map((option) => {
                const selected = value[filter.id] === option.value;
                return (
                  <button
                    key={option.value}
                    type="button"
                    aria-pressed={selected}
                    disabled={filter.disabled}
                    onClick={() => set(filter.id, option.value)}
                    className={cx(
                      "target-min rounded-pill inline-flex items-center gap-1.5 px-3 text-[13px]",
                      selected
                        ? "bg-surface text-ink shadow-card font-semibold"
                        : "text-muted hover:text-ink",
                    )}
                  >
                    {option.label}
                    {option.count === undefined ? null : (
                      <span className="text-muted font-mono text-[11px]">{option.count}</span>
                    )}
                  </button>
                );
              })}
            </div>
          </div>
        );
      })}
      {onReset === undefined ? null : (
        <Button variant="ghost" size="sm" icon="refresh" onClick={onReset}>
          {t("common:state.clearFilters")}
        </Button>
      )}
      <p aria-live="polite" role="status" className="text-muted ms-auto self-center text-xs">
        {resultCount === undefined ? null : t("common:table.resultCount", { count: resultCount })}
      </p>
    </div>
  );
}
