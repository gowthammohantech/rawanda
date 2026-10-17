/**
 * Decision outcome card (CLN-07 task 8). Three modes:
 * - `fresh` — just saved (toast shown by the page); `replayed` — the draft's key had already been
 *   processed (reload mid-submit, T-09): the stored result is shown, nothing was written twice;
 * - `already` — the review was decided before this page opened (or by someone else first:
 *   `ALREADY_DECIDED`): the existing decision, read-only.
 * Shows outcome, status, attribution, note / reason, and the linked referral / task the decision
 * created (or "nothing created"); links: View referral / View task / Back to queue / Next pending
 * case (first open review of the last queue view).
 */
import { domainKey, formatDateTime, useLanguage } from "@laif/i18n";
import type { ReviewDetail } from "@laif/repositories";
import {
  Card,
  InfoCallout,
  KeyValueList,
  LoadingSkeleton,
  useTx,
  type KeyValueItem,
} from "@laif/ui-web";
import { Link } from "react-router";

import { facilityLabel } from "../../app/persona-labels.ts";
import { routes } from "../../app/routes.ts";
import { useSession } from "../../session/useSession.ts";
import { lastQueueSearch } from "../queue/lastSearch.ts";
import { ReviewStatusPill } from "../reviews/ReviewDetailPage.tsx";
import { personaNameAndRole } from "../timeline/people.ts";
import { useNextPendingCase } from "./hooks.ts";

export type DecisionSuccessMode = "fresh" | "replayed" | "already";

const linkClass =
  "text-primary-dark target-min inline-flex items-center text-sm font-semibold underline";

export function DecisionSuccess({
  detail,
  mode,
}: {
  detail: ReviewDetail;
  mode: DecisionSuccessMode;
}) {
  const t = useTx();
  const { language } = useLanguage();
  const { can } = useSession();
  const { review, referrals, followUps } = detail;
  const decision = review.decision;
  const next = useNextPendingCase(review.id, true);
  const search = lastQueueSearch();
  const queueHref = search === "" ? routes.queue() : `${routes.queue()}?${search}`;

  const referral = referrals[0] ?? null;
  const followUp = followUps.find((fu) => fu.reviewId === review.id) ?? null;
  const decidedBy = decision?.decidedBy ?? review.reviewedBy;
  const decidedAt = decision?.decidedAt ?? review.reviewedAt;

  const items: KeyValueItem[] = [
    {
      id: "outcome",
      label: t("clinical:decision.success.outcome"),
      value: decision === null ? "—" : t(`clinical:decision.outcomes.${decision.kind}.label`),
    },
    {
      id: "status",
      label: t("clinical:decision.success.status"),
      value: <ReviewStatusPill status={review.status} />,
    },
    {
      id: "decidedBy",
      label: t("clinical:decision.success.decidedBy"),
      value: decidedBy === null ? "—" : personaNameAndRole(decidedBy, t),
    },
    {
      id: "decidedAt",
      label: t("clinical:decision.success.decidedAt"),
      value: decidedAt === null ? "—" : formatDateTime(decidedAt, language),
    },
  ];
  if (decision?.reasonCode !== undefined) {
    items.push({
      id: "reasonCode",
      label: t("clinical:decision.success.reasonCode"),
      value: t(domainKey("dismissReason", decision.reasonCode)),
    });
  }
  const note = decision?.note ?? review.decisionReason ?? "";
  if (note !== "") {
    items.push({
      id: "note",
      label: t("clinical:decision.success.note"),
      value: <span className="whitespace-pre-wrap">{note}</span>,
    });
  }
  if (referral !== null) {
    items.push({
      id: "referral",
      label: t("clinical:decision.success.referral"),
      value: (
        <span data-testid="success-referral" data-status={referral.status}>
          {t("clinical:decision.success.referralLine", {
            destination: facilityLabel(referral.destinationFacilityId, t),
            due: formatDateTime(referral.dueAt, language),
          })}{" "}
          · {t(domainKey("status.referral", referral.status))}
        </span>
      ),
    });
  }
  if (followUp !== null) {
    items.push({
      id: "task",
      label: t("clinical:decision.success.task"),
      value: (
        <span data-testid="success-task" data-purpose={followUp.purpose}>
          {t("clinical:decision.success.taskLine", {
            purpose: t(domainKey("followUpPurpose", followUp.purpose)),
            due: formatDateTime(followUp.dueAt, language),
          })}
        </span>
      ),
    });
  }

  const already = mode === "already";
  return (
    <div data-testid="decision-success" data-mode={mode} className="space-y-4">
      {already ? (
        <InfoCallout title={t("clinical:decision.success.alreadyTitle")}>
          <p className="m-0">{t("clinical:decision.success.alreadyBody")}</p>
        </InfoCallout>
      ) : null}
      {mode === "replayed" ? (
        <InfoCallout>
          <p className="m-0" data-testid="decision-replayed">
            {t("clinical:decision.success.replayed")}
          </p>
        </InfoCallout>
      ) : null}
      <Card
        title={already ? t("clinical:review.outcome.title") : t("clinical:decision.success.title")}
      >
        <div className="space-y-4">
          <KeyValueList items={items} />
          {referral === null && followUp === null ? (
            <p className="text-muted m-0 text-[13px]" data-testid="success-nothing-created">
              {t("clinical:decision.success.nothingCreated")}
            </p>
          ) : null}
          <nav
            aria-label={t("clinical:decision.success.title")}
            className="flex flex-wrap items-center gap-x-5 gap-y-2"
          >
            {referral !== null && can("referral.manage") ? (
              <Link to={routes.referrals()} className={linkClass} data-testid="view-referral">
                {t("clinical:decision.success.viewReferral")}
              </Link>
            ) : null}
            {followUp !== null && can("task.assign") ? (
              <Link to={routes.tasks()} className={linkClass} data-testid="view-task">
                {t("clinical:decision.success.viewTask")}
              </Link>
            ) : null}
            <Link to={routes.review(review.id)} className={linkClass}>
              {t("clinical:decision.success.openReview")}
            </Link>
            <Link to={queueHref} className={linkClass} data-testid="back-to-queue">
              {t("clinical:decision.success.backToQueue")}
            </Link>
            {next.isPending ? (
              <span className="w-32">
                <LoadingSkeleton lines={1} />
              </span>
            ) : next.data ? (
              <Link to={routes.review(next.data)} className={linkClass} data-testid="next-case">
                {t("clinical:decision.success.nextCase")}
              </Link>
            ) : (
              <span className="text-muted text-[13px]" data-testid="no-next-case">
                {t("clinical:decision.success.noNextCase")}
              </span>
            )}
          </nav>
        </div>
      </Card>
    </div>
  );
}
