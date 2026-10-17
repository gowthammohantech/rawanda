/**
 * One queue row (CLN-05 task 5/6). Collapsed: initials, patient + synthetic ID, one-line reason,
 * status pill (OVERDUE > URGENT · DEMO > IN REVIEW (by X) > NEEDS REVIEW; decided rows show their
 * status), relative flag time (demo clock), chevron. The disclosure button carries
 * `aria-expanded`; Enter / Space toggle it, → opens the review. Expanded: `QueueRowDetail`.
 */
import type { PersonaId } from "@laif/domain";
import { domainKey, formatRelativeToNow, useLanguage } from "@laif/i18n";
import { Avatar, ExpandableRow, StatusChip, useTx, type Tone } from "@laif/ui-web";
import { useEffect, useRef } from "react";
import { useNavigate } from "react-router";

import { routes } from "../../app/routes.ts";
import { personaName } from "../timeline/people.ts";
import { queuePill, type QueuePill } from "./model.ts";
import { QueueRowDetail } from "./QueueRowDetail.tsx";
import type { QueueItem } from "./useReviewQueue.ts";

export type QueueRowProps = {
  item: QueueItem;
  nowIso: string;
  personaId: PersonaId | null;
  expanded: boolean;
  onExpandedChange: (expanded: boolean) => void;
};

const PILL_TONE: Record<QueuePill["kind"], Tone> = {
  overdue: "warning",
  urgentDemo: "danger",
  inReview: "info",
  needsReview: "neutral",
  decided: "positive",
};

export function QueuePillChip({
  pill,
  personaId,
  testId = "queue-pill",
}: {
  pill: QueuePill;
  personaId: PersonaId | null;
  testId?: string;
}) {
  const t = useTx();
  let text: string;
  switch (pill.kind) {
    case "overdue":
      text = t("clinical:queue.row.status.overdue");
      break;
    case "urgentDemo":
      text = t("clinical:queue.row.status.urgentDemo");
      break;
    case "inReview":
      text =
        pill.by !== null && pill.by === personaId
          ? t("clinical:queue.row.status.inReviewByYou")
          : t("clinical:queue.row.status.inReviewBy", {
              name: personaName(pill.by) ?? t("clinical:queue.row.unassigned"),
            });
      break;
    case "needsReview":
      text = t("clinical:queue.row.status.needsReview");
      break;
    case "decided":
      text = t(domainKey("status.review", pill.status));
      break;
  }
  return (
    <StatusChip tone={PILL_TONE[pill.kind]} {...(pill.kind === "overdue" ? { icon: "clock" } : {})}>
      <span data-testid={testId} data-kind={pill.kind}>
        {text}
      </span>
    </StatusChip>
  );
}

export function QueueRow({ item, nowIso, personaId, expanded, onExpandedChange }: QueueRowProps) {
  const t = useTx();
  const { language } = useLanguage();
  const navigate = useNavigate();
  const { review, patient } = item;
  const now = new Date(nowIso);
  const pill = queuePill(review, { now, personaId });
  const name = patient?.displayName ?? t("clinical:queue.row.patientUnavailable");
  const [first, ...rest] = review.flagReasons;
  const reason =
    first === undefined
      ? t("clinical:queue.row.manualEscalation")
      : rest.length === 0
        ? t(domainKey("reason", first))
        : `${t(domainKey("reason", first))} ${t("clinical:queue.row.moreReasons", { count: rest.length })}`;
  const flagged = formatRelativeToNow(review.createdAt, { now: () => now }, language);

  // → on the disclosure button opens the review (Enter / Space are the button's own toggle).
  const rowRef = useRef<HTMLLIElement>(null);
  const reviewPath = routes.review(review.id);
  useEffect(() => {
    const row = rowRef.current;
    if (row === null) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "ArrowRight") return;
      const target = event.target as HTMLElement | null;
      if (target?.getAttribute("aria-expanded") == null) return;
      event.preventDefault();
      void navigate(reviewPath);
    };
    row.addEventListener("keydown", onKeyDown);
    return () => row.removeEventListener("keydown", onKeyDown);
  }, [navigate, reviewPath]);

  return (
    <li ref={rowRef} data-testid="queue-row" data-review-id={review.id} className="list-none">
      <ExpandableRow
        expanded={expanded}
        onExpandedChange={onExpandedChange}
        tone={
          pill.kind === "urgentDemo" ? "danger" : pill.kind === "overdue" ? "warning" : "default"
        }
        leading={<Avatar name={name} decorative />}
        title={
          <span className="flex flex-wrap items-baseline gap-x-2">
            <span>{name}</span>
            {patient === null ? null : (
              <span className="text-muted font-mono text-xs font-normal">
                {patient.syntheticIdentifier}
              </span>
            )}
          </span>
        }
        subtitle={reason}
        trailing={
          <>
            <QueuePillChip pill={pill} personaId={personaId} />
            {/* CLN-06: an urgent / overdue review that is already being reviewed says so too. */}
            {review.status === "in_review" && pill.kind !== "inReview" ? (
              <QueuePillChip
                pill={{ kind: "inReview", by: review.startedBy }}
                personaId={personaId}
                testId="queue-pill-in-review"
              />
            ) : null}
            <span className="text-muted text-xs whitespace-nowrap">
              {t("clinical:queue.row.flagged", { time: flagged })}
            </span>
          </>
        }
      >
        <p className="sr-only">{t("clinical:queue.row.openReviewHint")}</p>
        <QueueRowDetail item={item} />
      </ExpandableRow>
    </li>
  );
}
