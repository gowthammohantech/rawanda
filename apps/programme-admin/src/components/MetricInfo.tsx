/**
 * (i) disclosure for a metric (ADM-02 task 8, T-10): catalogue definition (numerator,
 * denominator, inclusion, attribution), n, "Computed {Kigali time}" (demo clock), the ruleset
 * versions present in the cohort and the metrics version. Keyboard: Enter/Space toggles, Escape
 * closes and returns focus.
 */
import { metricDefinition, type AggregateCell, type MetricDefinitionId } from "@laif/analytics";
import { formatDateTime, useLanguage } from "@laif/i18n";
import { Icon, useTx, type TranslationKey } from "@laif/ui-web";
import { useEffect, useId, useRef, useState } from "react";

import { SuppressedValue } from "./SuppressedValue.tsx";

export type MetricInfoProps = {
  metric: MetricDefinitionId;
  /** Basis count of the figure. */
  n?: AggregateCell;
  threshold: number;
  computedAt: string;
  rulesetVersions: readonly string[];
};

export function MetricInfo({ metric, n, threshold, computedAt, rulesetVersions }: MetricInfoProps) {
  const t = useTx();
  const { language } = useLanguage();
  const [open, setOpen] = useState(false);
  const panelId = useId();
  const buttonRef = useRef<HTMLButtonElement>(null);
  const rootRef = useRef<HTMLSpanElement>(null);
  const def = metricDefinition(metric);
  const label = t(def.labelKey as TranslationKey);

  useEffect(() => {
    if (!open) return;
    const onDown = (event: MouseEvent) => {
      if (rootRef.current !== null && !rootRef.current.contains(event.target as Node)) {
        setOpen(false);
      }
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      setOpen(false);
      buttonRef.current?.focus();
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <span ref={rootRef} className="relative inline-flex">
      <button
        ref={buttonRef}
        type="button"
        aria-expanded={open}
        aria-controls={panelId}
        aria-label={t("admin:overview.info.button", { metric: label })}
        onClick={() => setOpen((v) => !v)}
        className="text-muted hover:text-ink inline-flex min-h-6 min-w-6 items-center justify-center rounded-full"
      >
        <Icon name="info" size={14} />
      </button>
      {open ? (
        <div
          id={panelId}
          role="group"
          aria-label={label}
          tabIndex={-1}
          className="border-border-soft bg-surface shadow-card absolute start-0 top-7 z-20 w-72 rounded-md border p-3 text-start text-xs font-normal normal-case"
        >
          <p className="text-ink mb-2 text-[13px] font-semibold">{label}</p>
          <dl className="text-ink grid gap-1.5">
            <div>
              <dt className="text-muted">{t("admin:overview.info.numerator")}</dt>
              <dd>{t(def.numerator as TranslationKey)}</dd>
            </div>
            {def.denominator === null ? null : (
              <div>
                <dt className="text-muted">{t("admin:overview.info.denominator")}</dt>
                <dd>{t(def.denominator as TranslationKey)}</dd>
              </div>
            )}
            <div>
              <dt className="text-muted">{t("admin:overview.info.inclusion")}</dt>
              <dd>{t(def.inclusion as TranslationKey)}</dd>
            </div>
            <div>
              <dt className="text-muted">{t("admin:overview.info.attribution")}</dt>
              <dd>{t(def.attribution as TranslationKey)}</dd>
            </div>
            {n === undefined ? null : (
              <div>
                <dt className="text-muted">{t("admin:overview.info.n")}</dt>
                <dd>
                  <SuppressedValue cell={n} threshold={threshold} compact />
                </dd>
              </div>
            )}
            <div>
              <dt className="text-muted">{t("admin:overview.info.computed")}</dt>
              <dd>
                {t("admin:overview.info.computedAt", {
                  time: formatDateTime(computedAt, language),
                })}
              </dd>
            </div>
            <div>
              <dt className="text-muted">{t("admin:overview.info.rulesets")}</dt>
              <dd className="font-mono">
                {rulesetVersions.length === 0
                  ? t("admin:overview.info.noRulesets")
                  : rulesetVersions.join(", ")}
              </dd>
            </div>
            <div>
              <dt className="text-muted">{t("admin:overview.info.version")}</dt>
              <dd className="font-mono">{def.version}</dd>
            </div>
          </dl>
        </div>
      ) : null}
    </span>
  );
}
