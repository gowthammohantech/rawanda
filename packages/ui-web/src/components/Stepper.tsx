import type { ReactNode } from "react";

import { cx } from "../cx.ts";
import { useTx } from "../i18n.ts";
import { Icon } from "../icons/Icon.tsx";

export type StepStatus = "done" | "current" | "upcoming" | "cancelled";

export type StepperStep = {
  id: string;
  /** Translated step label. */
  label: ReactNode;
  /** Explicit status; otherwise derived from `currentIndex`. */
  status?: StepStatus;
  /** Small text under the label (timestamp, actor). */
  description?: ReactNode;
};

export type StepperProps = {
  steps: readonly StepperStep[];
  /** 0-based index of the current step (ignored for steps with an explicit status). */
  currentIndex?: number;
  /** Accessible name; defaults to `common:ui.stepper`. */
  label?: string;
  /** Rendered after the steps (e.g. a CANCELLED StatusChip for a terminal branch). */
  terminal?: ReactNode;
  orientation?: "horizontal" | "vertical";
  className?: string;
};

function statusOf(step: StepperStep, index: number, currentIndex: number): StepStatus {
  if (step.status !== undefined) return step.status;
  if (index < currentIndex) return "done";
  if (index === currentIndex) return "current";
  return "upcoming";
}

/** Numbered steps with done / current / upcoming (ref image 4); `aria-current="step"`. */
export function Stepper({
  steps,
  currentIndex = 0,
  label,
  terminal,
  orientation = "horizontal",
  className,
}: StepperProps) {
  const t = useTx();
  return (
    <div className={cx("border-border-soft bg-surface rounded-lg border px-4 py-3", className)}>
      <ol
        aria-label={label ?? t("common:ui.stepper")}
        className={cx(
          "m-0 flex list-none gap-3 p-0",
          orientation === "horizontal" ? "flex-col md:flex-row md:items-center" : "flex-col",
        )}
      >
        {steps.map((step, index) => {
          const status = statusOf(step, index, currentIndex);
          return (
            <li
              key={step.id}
              data-status={status}
              aria-current={status === "current" ? "step" : undefined}
              className={cx(
                "flex min-w-0 items-center gap-2.5",
                orientation === "horizontal" && "md:flex-1",
              )}
            >
              <span
                aria-hidden="true"
                className={cx(
                  "inline-flex size-6 shrink-0 items-center justify-center rounded-sm border font-mono text-xs",
                  status === "done" && "border-ink bg-ink text-on-primary",
                  status === "current" && "border-primary bg-primary text-on-primary",
                  status === "upcoming" && "border-border bg-surface text-muted",
                  status === "cancelled" && "border-danger bg-danger-soft text-danger",
                )}
              >
                {status === "done" ? (
                  <Icon name="check" size={14} strokeWidth={2.4} />
                ) : status === "cancelled" ? (
                  <Icon name="close" size={14} strokeWidth={2.4} />
                ) : (
                  index + 1
                )}
              </span>
              <span className="min-w-0">
                <span
                  className={cx(
                    "block truncate text-sm",
                    status === "current" ? "text-ink font-semibold" : "text-muted",
                    status === "done" && "text-ink",
                  )}
                >
                  {step.label}
                </span>
                <span className="sr-only">
                  {`${t("common:ui.stepPosition", { index: index + 1, total: steps.length })}, ${t(`common:ui.stepStatus.${status}`)}`}
                </span>
                {step.description === undefined ? null : (
                  <span className="text-muted block text-xs">{step.description}</span>
                )}
              </span>
              {orientation === "horizontal" && index < steps.length - 1 ? (
                <span
                  aria-hidden="true"
                  className="bg-border hidden h-px min-w-6 flex-1 md:block"
                />
              ) : null}
            </li>
          );
        })}
      </ol>
      {terminal === undefined ? null : <div className="mt-3">{terminal}</div>}
    </div>
  );
}
