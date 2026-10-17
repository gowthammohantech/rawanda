/**
 * One screening on the timeline (CLN-04 task 2–6): Kigali measured time (+ "recorded in the
 * system" when later), BP + glucose with explicit units and context, source (worker · channel ·
 * facility), ruleset version, status chip (icon + text, never colour only), AMENDED chip, the
 * `DEMO_RULE_NOT_CLINICALLY_VALIDATED` pill when flagged, repeat-reading pairing, correction
 * history and the amend action (capability `screening.amend`; coordinators see "Amendments
 * require clinician privileges"; disabled with a reason while the offline fault is on).
 */
import { DEMO_RULE_DISCLAIMER, type Screening } from "@laif/domain";
import { domainKey, formatDateTime, formatTime, useLanguage } from "@laif/i18n";
import { Button, KeyValueList, MicroLabel, StatusChip, useTx } from "@laif/ui-web";
import { useState } from "react";

import { facilityLabel } from "../../app/persona-labels.ts";
import { AmendScreeningDialog } from "./AmendScreeningDialog.tsx";
import { CorrectionHistory } from "./CorrectionHistory.tsx";
import {
  OPEN_REVIEW_STATUSES,
  screeningAnchorId,
  STATUS_TONE,
  type ScreeningEntry,
} from "./model.ts";
import { personaById } from "./people.ts";
import { ReadingDisplay } from "./ReadingDisplay.tsx";

const STATUS_ICON = {
  review_required: "alert",
  no_review_required: "check",
  reviewed: "clipboard",
} as const;

/** "Recorded in the system" is shown when it differs from the measurement by over a minute. */
const RECORDED_GAP_MS = 60_000;

export type ScreeningCardProps = {
  entry: ScreeningEntry;
  nowIso: string;
  canAmend: boolean;
  offline: boolean;
  /** Amendment just saved on this screening (highlighted in the history). */
  highlightAmendmentId?: string | null;
  onAmended?: (screening: Screening, amendmentId: string | null) => void;
};

export function ScreeningCard({
  entry,
  nowIso,
  canAmend,
  offline,
  highlightAmendmentId = null,
  onAmended,
}: ScreeningCardProps) {
  const t = useTx();
  const { language } = useLanguage();
  const [amending, setAmending] = useState(false);
  const { screening, readings, review } = entry;
  const measured = formatDateTime(readings.measuredAt, language);
  const worker = personaById(screening.workerId);
  const recordedLater =
    Date.parse(screening.createdAt) - Date.parse(readings.measuredAt) > RECORDED_GAP_MS;
  const flagged = screening.flag?.requiresReview === true;
  const openReview = review !== null && OPEN_REVIEW_STATUSES.includes(review.status);
  const headingId = `${screeningAnchorId(screening.id)}-heading`;

  const sourceParts = [
    worker === null
      ? t("clinical:timeline.screening.workerUnknown")
      : t("clinical:timeline.screening.worker", {
          name: worker.displayName,
          code: worker.workerCode ?? "—",
        }),
    t(domainKey("screeningSource", screening.source)),
    facilityLabel(screening.facilityId, t),
  ];

  return (
    <article
      id={screeningAnchorId(screening.id)}
      aria-labelledby={headingId}
      data-testid="screening-card"
      data-screening-id={screening.id}
      className="border-border-soft bg-surface shadow-card scroll-mt-24 space-y-3 rounded-lg border p-4"
    >
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0 space-y-1">
          <h3 id={headingId} className="font-display text-ink m-0 text-base font-semibold">
            <time dateTime={readings.measuredAt}>
              {t("clinical:timeline.screening.heading", { time: measured })}
            </time>
          </h3>
          {entry.pairedWith.length > 0 ? (
            <p className="m-0 flex flex-wrap items-center gap-2 text-xs">
              <MicroLabel tone="info">{t("clinical:timeline.screening.repeatReading")}</MicroLabel>
              {entry.pairedWith.map((pair) => (
                <a
                  key={pair.id}
                  href={`#${screeningAnchorId(pair.id)}`}
                  className="text-primary-dark font-medium underline"
                >
                  {t("clinical:timeline.screening.pairedWith", {
                    time: formatTime(pair.measuredAt, language),
                  })}
                </a>
              ))}
            </p>
          ) : null}
        </div>
        <div className="flex flex-wrap items-center gap-1.5" data-testid="screening-status">
          <StatusChip tone={STATUS_TONE[entry.status]} icon={STATUS_ICON[entry.status]}>
            {t(`clinical:timeline.status.${entry.status}`)}
          </StatusChip>
          {entry.amended ? (
            <StatusChip tone="neutral" icon="file">
              {t("clinical:timeline.status.amended")}
            </StatusChip>
          ) : null}
          {flagged ? (
            <StatusChip tone="warning" icon="alert" className="max-w-[18rem]">
              {screening.flag?.displayDisclaimer ?? DEMO_RULE_DISCLAIMER}
            </StatusChip>
          ) : null}
        </div>
      </div>

      <KeyValueList
        items={[
          {
            id: "bp",
            label: t("clinical:timeline.screening.bp"),
            value: (
              <ReadingDisplay
                kind="bloodPressure"
                systolic={readings.systolic}
                diastolic={readings.diastolic}
              />
            ),
          },
          {
            id: "glucose",
            label: t("clinical:timeline.screening.glucose"),
            value: (
              <ReadingDisplay
                kind="glucose"
                value={readings.glucoseValue}
                unit={readings.glucoseUnit}
                context={readings.glucoseContext}
              />
            ),
          },
          {
            id: "measuredAt",
            label: t("clinical:timeline.screening.measuredAt"),
            value: (
              <span className="flex flex-col">
                <time dateTime={readings.measuredAt}>{measured}</time>
                {recordedLater ? (
                  <span className="text-muted text-xs">
                    {t("clinical:timeline.screening.recordedAt", {
                      time: formatDateTime(screening.createdAt, language),
                    })}
                  </span>
                ) : null}
              </span>
            ),
          },
          {
            id: "source",
            label: t("clinical:timeline.screening.source"),
            value: sourceParts.join(" · "),
          },
          {
            id: "ruleset",
            label: t("clinical:timeline.screening.rulesetVersion"),
            value: (
              <span className="font-mono text-xs">
                {screening.rulesetVersion ?? t("clinical:timeline.screening.noRuleset")}
              </span>
            ),
          },
          ...(screening.flag !== null && screening.flag.reasonCodes.length > 0
            ? [
                {
                  id: "flagReasons",
                  label: t("clinical:timeline.screening.flagReasons"),
                  value: (
                    <ul className="m-0 list-none space-y-0.5 p-0">
                      {screening.flag.reasonCodes.map((code) => (
                        <li key={code}>{t(domainKey("reason", code))}</li>
                      ))}
                    </ul>
                  ),
                },
              ]
            : []),
          ...(screening.notes.trim() === ""
            ? []
            : [
                {
                  id: "notes",
                  label: t("clinical:timeline.screening.notes"),
                  value: screening.notes,
                },
              ]),
        ]}
      />

      {entry.amended && review !== null ? (
        <p className="text-muted m-0 text-xs">{t("clinical:timeline.screening.reReview")}</p>
      ) : null}

      <CorrectionHistory screening={screening} highlightId={highlightAmendmentId} />

      <div className="flex flex-wrap items-center gap-3">
        {canAmend ? (
          <>
            <Button
              variant="secondary"
              size="sm"
              icon="file"
              disabled={offline}
              aria-label={t("clinical:timeline.screening.amendLabel", { time: measured })}
              {...(offline ? { "aria-describedby": `${headingId}-offline` } : {})}
              onClick={() => setAmending(true)}
            >
              {t("clinical:timeline.screening.amend")}
            </Button>
            {offline ? (
              <span id={`${headingId}-offline`} className="text-risk-warning text-xs font-medium">
                {t("clinical:timeline.screening.amendOffline")}
              </span>
            ) : null}
          </>
        ) : (
          <p className="text-muted m-0 text-xs" data-testid="amend-denied">
            {t("clinical:timeline.screening.amendDenied")}
          </p>
        )}
      </div>

      {canAmend ? (
        <AmendScreeningDialog
          screening={screening}
          open={amending}
          onOpenChange={setAmending}
          nowIso={nowIso}
          hasOpenReview={openReview}
          {...(onAmended === undefined ? {} : { onSaved: onAmended })}
        />
      ) : null}
    </article>
  );
}
