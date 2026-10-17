/**
 * Correction history disclosure (CLN-04 task 5, T-06): collapsed by default with a count badge;
 * each FND-02 `screening.amendments[]` entry shows the field, the ORIGINAL value (struck through
 * but readable — never removed), the amended value, the reason, the author (name + role), the
 * Kigali timestamp and the version it produced. Entries are append-only and listed oldest first.
 * `highlightId` (the amendment just saved) opens the disclosure and marks that entry "New".
 */
import type { Screening } from "@laif/domain";
import { domainKey, formatDateTime, useLanguage } from "@laif/i18n";
import { cx, Icon, StatusChip, useTx } from "@laif/ui-web";
import { useId, useState } from "react";

import { personaNameAndRole } from "./people.ts";
import { formatAmendableValue } from "./values.ts";

export type CorrectionHistoryProps = {
  screening: Pick<Screening, "id" | "amendments" | "version" | "glucoseUnit">;
  /** Amendment to highlight (just saved); also expands the disclosure. */
  highlightId?: string | null;
};

export function CorrectionHistory({ screening, highlightId = null }: CorrectionHistoryProps) {
  const t = useTx();
  const { language } = useLanguage();
  const panelId = useId();
  const count = screening.amendments.length;
  const [open, setOpen] = useState(false);
  // A newly saved amendment opens the disclosure (state adjusted during render, no effect).
  const [seenHighlight, setSeenHighlight] = useState<string | null>(null);
  if (highlightId !== null && highlightId !== seenHighlight) {
    setSeenHighlight(highlightId);
    setOpen(true);
  }

  if (count === 0) return null;

  // Each amendment bumps the version by one (FND-02 `applyAmendment`).
  const versionOf = (index: number) => screening.version - (count - 1 - index);
  // The glucose unit in force when the value was shown (effective unit up to that amendment).
  const unitAt = (index: number) => {
    let unit = screening.glucoseUnit;
    for (const a of screening.amendments.slice(0, index + 1)) {
      if (a.field === "glucoseUnit") unit = a.after as typeof unit;
    }
    return unit;
  };

  return (
    <div data-testid="correction-history" className="border-border-soft rounded-md border">
      <button
        type="button"
        aria-expanded={open}
        aria-controls={panelId}
        onClick={() => setOpen((value) => !value)}
        className="target-min text-ink hover:bg-background flex w-full items-center justify-between gap-2 rounded-md px-3 py-2 text-start text-sm font-semibold"
      >
        <span className="inline-flex items-center gap-2">
          <Icon name="clock" size={16} />
          {open
            ? t("clinical:timeline.history.hide", { count })
            : t("clinical:timeline.history.show", { count })}
        </span>
        <Icon name={open ? "chevron-up" : "chevron-down"} size={16} />
      </button>
      {open ? (
        <ol
          id={panelId}
          className="m-0 list-none space-y-2 p-3 pt-0"
          aria-label={t("clinical:timeline.history.title")}
        >
          {screening.amendments.map((amendment, index) => {
            const glucoseUnit = unitAt(index);
            const fmt = (value: typeof amendment.before) =>
              formatAmendableValue(amendment.field, value, { glucoseUnit, t, language });
            const highlighted = amendment.id === highlightId;
            return (
              <li
                key={amendment.id}
                data-testid="correction-entry"
                data-highlighted={highlighted || undefined}
                className={cx(
                  "rounded-sm border p-3 text-[13px]",
                  highlighted
                    ? "border-primary bg-primary-soft"
                    : "border-border-soft bg-background",
                )}
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="text-ink m-0 font-semibold">
                    {t(domainKey("amendableField", amendment.field))}
                  </p>
                  <span className="inline-flex items-center gap-2">
                    {highlighted ? (
                      <StatusChip tone="info" icon="check">
                        {t("clinical:timeline.history.newEntry")}
                      </StatusChip>
                    ) : null}
                    <span className="text-muted font-mono text-xs">
                      {t("clinical:timeline.history.versionValue", { version: versionOf(index) })}
                    </span>
                  </span>
                </div>
                <dl className="m-0 mt-2 grid grid-cols-[minmax(96px,auto)_1fr] gap-x-3 gap-y-1">
                  <dt className="text-muted">{t("clinical:timeline.history.original")}</dt>
                  <dd className="m-0">
                    <del data-testid="correction-original" className="text-muted">
                      {fmt(amendment.before)}
                    </del>
                  </dd>
                  <dt className="text-muted">{t("clinical:timeline.history.amended")}</dt>
                  <dd data-testid="correction-amended" className="text-ink m-0 font-medium">
                    {fmt(amendment.after)}
                  </dd>
                  <dt className="text-muted">{t("clinical:timeline.history.reason")}</dt>
                  <dd className="text-ink m-0">{amendment.reason}</dd>
                  <dt className="text-muted">{t("clinical:timeline.history.by")}</dt>
                  <dd className="text-ink m-0">{personaNameAndRole(amendment.amendedBy, t)}</dd>
                  <dt className="text-muted">{t("clinical:timeline.history.at")}</dt>
                  <dd className="text-ink m-0">
                    <time dateTime={amendment.amendedAt}>
                      {formatDateTime(amendment.amendedAt, language)}
                    </time>
                  </dd>
                </dl>
              </li>
            );
          })}
        </ol>
      ) : null}
    </div>
  );
}
