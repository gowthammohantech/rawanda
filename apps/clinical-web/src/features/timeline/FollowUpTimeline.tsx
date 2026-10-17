/**
 * Patient follow-up timeline (CLN-04 task 8): review decisions, referral created / scheduled /
 * completed / cancelled and follow-up assigned / contact attempts / completed, newest first
 * (`toFollowUpEvents`). Each item: status pill (icon + text), actor, due date; the OVERDUE pill
 * is derived (`dueAt < demo now` and not terminal) with the text "Overdue (derived from due
 * date)" — it appears only on items that carry a past `dueAt`.
 */
import { formatDate, formatDateTime, useLanguage } from "@laif/i18n";
import { StatusChip, Timeline, useTx, type TimelineItem, type TranslationKey } from "@laif/ui-web";
import { Link } from "react-router";

import { routes } from "../../app/routes.ts";
import type { FollowUpEvent } from "./model.ts";
import { personaName } from "./people.ts";

const asKey = (key: string) => key as TranslationKey;

function useEventTitle() {
  const t = useTx();
  const { language } = useLanguage();
  return (event: FollowUpEvent): string => {
    const v = event.values;
    switch (event.kind) {
      case "reviewDecided":
        return t("clinical:timeline.followUp.reviewDecided", {
          decision: t(asKey(`domain:decision.${v["decision"] ?? ""}`)),
        });
      case "referralCreated":
        return t("clinical:timeline.followUp.referralCreated", {
          destination: v["destination"] ?? "",
        });
      case "referralScheduled":
        return t("clinical:timeline.followUp.referralScheduled", {
          time: formatDateTime(v["appointmentAt"] ?? event.occurredAt, language),
        });
      case "referralCompleted":
        return t("clinical:timeline.followUp.referralCompleted", {
          outcome:
            v["outcome"] === undefined || v["outcome"] === ""
              ? "—"
              : t(asKey(`domain:referralOutcome.${v["outcome"]}`)),
        });
      case "referralCancelled":
        return t("clinical:timeline.followUp.referralCancelled");
      case "followUpAssigned":
        return t("clinical:timeline.followUp.followUpAssigned", {
          purpose: t(asKey(`domain:followUpPurpose.${v["purpose"] ?? ""}`)),
        });
      case "followUpAttempt":
        return t("clinical:timeline.followUp.followUpAttempt", {
          result: t(asKey(`domain:contactResult.${v["result"] ?? ""}`)),
        });
      case "followUpCompleted":
        return t("clinical:timeline.followUp.followUpCompleted", {
          outcome: t(asKey(`domain:followUpOutcome.${v["outcome"] ?? ""}`)),
        });
    }
  };
}

export type FollowUpTimelineProps = { events: readonly FollowUpEvent[] };

export function FollowUpTimeline({ events }: FollowUpTimelineProps) {
  const t = useTx();
  const { language } = useLanguage();
  const title = useEventTitle();

  const items: TimelineItem[] = events.map((event) => {
    const actor = personaName(event.actorId);
    const meta: string[] = [
      actor === null
        ? t("clinical:timeline.followUp.actorUnknown")
        : t("clinical:timeline.followUp.actor", { name: actor }),
    ];
    if (event.kind === "followUpAssigned") {
      const assignee = personaName(event.assigneeId);
      meta.push(
        assignee === null
          ? t("clinical:timeline.followUp.unassigned")
          : t("clinical:timeline.followUp.assignedTo", { name: assignee }),
      );
    }
    if (event.dueAt !== null) {
      meta.push(t("clinical:timeline.followUp.due", { date: formatDate(event.dueAt, language) }));
    }
    const status = t(asKey(`domain:${event.status.group}.${event.status.value}`));
    return {
      id: event.id,
      dateLabel: formatDate(event.occurredAt, language),
      dateTime: event.occurredAt,
      title:
        event.reviewId === undefined ? (
          title(event)
        ) : (
          <Link to={routes.review(event.reviewId)} className="text-primary-dark underline">
            {title(event)}
          </Link>
        ),
      chip: (
        <span className="flex flex-wrap items-center gap-1.5" data-testid="followup-event-chips">
          <StatusChip tone="neutral" icon="activity">
            {status}
          </StatusChip>
          {event.overdue ? (
            <span data-testid="overdue-pill">
              <StatusChip tone="danger" icon="clock">
                {t("clinical:timeline.followUp.overdue")}
              </StatusChip>
            </span>
          ) : null}
        </span>
      ),
      meta: (
        <span className="flex flex-col gap-0.5">
          <span>{meta.join(" · ")}</span>
          {event.overdue ? (
            <span className="text-risk-danger font-medium">
              {t("clinical:timeline.followUp.overdueHint")}
            </span>
          ) : null}
        </span>
      ),
    };
  });

  return (
    <div data-testid="followup-timeline">
      <Timeline label={t("clinical:timeline.followUp.label")} items={items} />
    </div>
  );
}
