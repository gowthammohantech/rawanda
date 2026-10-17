/**
 * Referral detail drawer (CLN-08 task 4/5/11), opened from `?id=` (deep-linkable):
 * patient (link), linked review summary (outcome, decided by, link), status + the DERIVED overdue
 * badge "Overdue — due dd MMM (derived)", `ReferralStepper` (timestamps + actors per step,
 * cancelled branch), details (destination, priority, due, appointment, reason, completion
 * evidence, cancellation reason + actor) and the full history from the audit log
 * (`listAuditEvents({ entityId })`).
 *
 * Actions: only the legal next transitions render (`allowedActions`), by capability
 * (`referral.manage`: accept / schedule / edit / cancel; `referral.complete`: complete). Without
 * the capability — or for a referral only visible as the destination facility — the buttons are
 * absent and an explanation is shown. Offline: actions disabled, the drawer stays readable.
 * Out-of-scope id → `PermissionDenied` (the repository audits `access.denied`). Opening records
 * `referral.viewed` (`useAuditedRead`). After a save the stepper moves focus to the new step.
 */
import { isReferralOverdue, type AuditEvent, type Referral } from "@laif/domain";
import { domainKey, formatDateTime, useLanguage } from "@laif/i18n";
import {
  Button,
  Drawer,
  EmptyState,
  InfoCallout,
  KeyValueList,
  LoadingSkeleton,
  PermissionDenied,
  Timeline,
  useTx,
  type KeyValueItem,
  type TimelineItem,
  type TranslationKey,
} from "@laif/ui-web";
import { useState } from "react";
import { Link } from "react-router";

import { useDemoTools } from "../../app/demo-tools.tsx";
import { facilityLabel } from "../../app/persona-labels.ts";
import { routes } from "../../app/routes.ts";
import { QueryErrorState } from "../../components/QueryErrorState.tsx";
import { toClinicalError } from "../../data/errors.ts";
import { useAuditedRead } from "../../data/useAuditedRead.ts";
import { useSession } from "../../session/useSession.ts";
import { personaName, personaNameAndRole } from "../timeline/people.ts";
import { CancelReferralDialog } from "./CancelReferralDialog.tsx";
import { CompleteReferralDialog } from "./CompleteReferralDialog.tsx";
import { useLinkedReview, useReferral, useReferralHistory, type PatientNames } from "./hooks.ts";
import { allowedActions, type ReferralAction } from "./model.ts";
import { OverduePill, ReferralStatusPill } from "./ReferralTable.tsx";
import { ReferralStepper } from "./ReferralStepper.tsx";
import { UpdateReferralDialog } from "./UpdateReferralDialog.tsx";

export type ReferralDrawerProps = {
  id: string | null;
  onClose: () => void;
  nowIso: string;
  patients: PatientNames | undefined;
};

const linkClass = "text-primary-dark target-min inline-flex items-center font-semibold underline";

export function ReferralDrawer({ id, onClose, nowIso, patients }: ReferralDrawerProps) {
  const t = useTx();
  const query = useReferral(id);
  const referral = query.data ?? null;
  const denied = query.isError && toClinicalError(query.error).code === "FORBIDDEN";
  const patientName =
    referral === null
      ? null
      : (patients?.get(referral.patientId)?.displayName ?? referral.patientId);

  return (
    <Drawer
      open={id !== null}
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
      size="lg"
      title={
        patientName === null
          ? t("clinical:referrals.drawer.title")
          : t("clinical:referrals.drawer.titleFor", { name: patientName })
      }
      description={t("clinical:referrals.drawer.description")}
    >
      <div data-testid="referral-drawer" data-referral-id={id ?? ""}>
        {query.isPending ? (
          <div aria-busy="true" aria-label={t("clinical:referrals.drawer.loading")}>
            <LoadingSkeleton lines={6} />
          </div>
        ) : denied ? (
          <div data-testid="referral-denied">
            <PermissionDenied message={t("clinical:referrals.drawer.denied")} />
          </div>
        ) : query.isError ? (
          <QueryErrorState error={query.error} onRetry={() => void query.refetch()} />
        ) : referral === null ? (
          <div data-testid="referral-not-found">
            <EmptyState icon="search" title={t("clinical:referrals.drawer.notFound")} />
          </div>
        ) : (
          <ReferralDetail referral={referral} nowIso={nowIso} patientName={patientName ?? ""} />
        )}
      </div>
    </Drawer>
  );
}

function ReferralDetail({
  referral,
  nowIso,
  patientName,
}: {
  referral: Referral;
  nowIso: string;
  patientName: string;
}) {
  const t = useTx();
  const { language } = useLanguage();
  const { can, activeFacilityId } = useSession();
  const { faultConfig } = useDemoTools();
  const offline = faultConfig.offline;
  const history = useReferralHistory(referral.id);
  const review = useLinkedReview(referral);
  const [action, setAction] = useState<ReferralAction | null>(null);
  const [focusToken, setFocusToken] = useState<number | null>(null);

  useAuditedRead({
    action: "referral.viewed",
    entityType: "referral",
    entityId: referral.id,
    patientId: referral.patientId,
    facilityId: referral.facilityId,
  });

  const caps = { manage: can("referral.manage"), complete: can("referral.complete") };
  const owned = referral.facilityId === activeFacilityId;
  const actions = owned ? allowedActions(referral.status, caps) : [];
  const overdue = isReferralOverdue(referral, new Date(nowIso));
  const events = history.data ?? [];
  const decision = review.data?.decision ?? null;
  const decidedBy = decision?.decidedBy ?? review.data?.reviewedBy ?? null;

  const details: KeyValueItem[] = [
    {
      id: "patient",
      label: t("clinical:referrals.table.patient"),
      value: (
        <Link to={routes.patient(referral.patientId, "referralsTasks")} className={linkClass}>
          {patientName}
        </Link>
      ),
    },
    {
      id: "review",
      label: t("clinical:referrals.drawer.linkedReview"),
      value: (
        <span className="flex flex-col gap-0.5" data-testid="referral-linked-review">
          <Link to={routes.review(referral.reviewId)} className={linkClass}>
            {t("clinical:referrals.drawer.openReview")}
          </Link>
          {review.isPending ? null : (
            <span className="text-muted text-[13px]">
              {decision === null
                ? t("clinical:referrals.drawer.reviewNoDecision")
                : t("clinical:referrals.drawer.reviewSummary", {
                    outcome: t(`clinical:decision.outcomes.${decision.kind}.label`),
                    name: decidedBy === null ? "—" : personaNameAndRole(decidedBy, t),
                  })}
            </span>
          )}
        </span>
      ),
    },
    {
      id: "destination",
      label: t("clinical:referrals.table.destination"),
      value: facilityLabel(referral.destinationFacilityId, t),
    },
    {
      id: "referring",
      label: t("clinical:referrals.drawer.referringFacility"),
      value: facilityLabel(referral.facilityId, t),
    },
    {
      id: "priority",
      label: t("clinical:referrals.table.priority"),
      value: t(domainKey("priority", referral.priority)),
    },
    {
      id: "due",
      label: t("clinical:referrals.table.due"),
      value: formatDateTime(referral.dueAt, language),
    },
  ];
  if (referral.appointmentAt !== null) {
    details.push({
      id: "appointment",
      label: t("clinical:referrals.drawer.appointment"),
      value: formatDateTime(referral.appointmentAt, language),
    });
  }
  if (referral.referralReason !== undefined && referral.referralReason !== "") {
    details.push({
      id: "reason",
      label: t("clinical:referrals.drawer.reason"),
      value: <span className="whitespace-pre-wrap">{referral.referralReason}</span>,
    });
  }

  const evidence = referral.completionEvidence;
  const cancelled = referral.cancelled;
  const cancelEvent =
    [...events]
      .reverse()
      .find(
        (e) =>
          e.action === "referral.cancelled" ||
          (e.action === "referral.transitioned" &&
            (e.changeSummary as { to?: unknown } | null)?.to === "cancelled_with_reason"),
      ) ?? null;

  const saved = (next: Referral) => {
    setFocusToken(next.version);
  };

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center gap-2">
        <ReferralStatusPill status={referral.status} />
        {overdue ? <OverduePill dueAt={referral.dueAt} /> : null}
      </div>

      {history.isPending ? (
        <LoadingSkeleton lines={2} />
      ) : (
        <ReferralStepper
          referral={referral}
          history={events}
          creatorId={decision?.decidedBy ?? null}
          focusToken={focusToken}
        />
      )}

      <section aria-labelledby="referral-actions-title" className="space-y-2">
        <h3 id="referral-actions-title" className="micro-label text-muted m-0">
          {t("clinical:referrals.drawer.actions")}
        </h3>
        {actions.length === 0 ? (
          <p className="text-muted m-0 text-[13px]" data-testid="referral-no-actions">
            {!owned
              ? t("clinical:referrals.drawer.destinationOnly")
              : referral.status === "completed" || referral.status === "cancelled_with_reason"
                ? t("clinical:referrals.drawer.terminal")
                : t("clinical:referrals.drawer.noPermission")}
          </p>
        ) : (
          <>
            <div className="flex flex-wrap gap-2" data-testid="referral-actions">
              {actions.map((a) => (
                <Button
                  key={a}
                  variant={a === "complete" ? "primary" : a === "cancel" ? "danger" : "secondary"}
                  size="sm"
                  disabled={offline}
                  data-testid={`referral-action-${a}`}
                  onClick={() => setAction(a)}
                >
                  {t(`clinical:referrals.actions.${a}`)}
                </Button>
              ))}
            </div>
            {offline ? (
              <p className="text-muted m-0 text-[13px]" data-testid="referral-offline">
                {t("clinical:referrals.drawer.offline")}
              </p>
            ) : null}
            {!caps.complete && referral.status === "scheduled" ? (
              <p className="text-muted m-0 text-[13px]">
                {t("clinical:referrals.drawer.noCompletePermission")}
              </p>
            ) : null}
          </>
        )}
      </section>

      <section aria-labelledby="referral-details-title" className="space-y-2">
        <h3 id="referral-details-title" className="micro-label text-muted m-0">
          {t("clinical:referrals.drawer.details")}
        </h3>
        <KeyValueList items={details} />
      </section>

      {evidence !== null ? (
        <section
          aria-labelledby="referral-evidence-title"
          className="space-y-2"
          data-testid="referral-evidence"
        >
          <h3 id="referral-evidence-title" className="micro-label text-muted m-0">
            {t("clinical:referrals.drawer.evidence")}
          </h3>
          <KeyValueList
            items={[
              {
                id: "completedAt",
                label: t("clinical:referrals.complete.completedAt"),
                value:
                  referral.completedAt === null
                    ? "—"
                    : formatDateTime(referral.completedAt, language),
              },
              {
                id: "outcome",
                label: t("clinical:referrals.complete.outcomeLabel"),
                value: t(domainKey("referralOutcome", evidence.outcome)),
              },
              {
                id: "type",
                label: t("clinical:referrals.complete.evidenceTypeLabel"),
                value: t(domainKey("evidence", evidence.type)),
              },
              {
                id: "reference",
                label: t("clinical:referrals.complete.evidenceReference"),
                value: evidence.reference,
              },
              {
                id: "recordedBy",
                label: t("clinical:referrals.drawer.recordedBy"),
                value: t("clinical:referrals.drawer.byAt", {
                  name: personaName(evidence.recordedBy) ?? "—",
                  when: formatDateTime(evidence.recordedAt, language),
                }),
              },
              ...(evidence.note === "" || evidence.note === undefined
                ? []
                : [
                    {
                      id: "note",
                      label: t("clinical:referrals.complete.note"),
                      value: evidence.note,
                    },
                  ]),
            ]}
          />
        </section>
      ) : null}

      {cancelled !== null ? (
        <section
          aria-labelledby="referral-cancel-title"
          className="space-y-2"
          data-testid="referral-cancellation"
        >
          <h3 id="referral-cancel-title" className="micro-label text-muted m-0">
            {t("clinical:referrals.drawer.cancellation")}
          </h3>
          <KeyValueList
            items={[
              {
                id: "code",
                label: t("clinical:referrals.cancel.reasonCode"),
                value: t(domainKey("referralCancelReason", cancelled.reasonCode)),
              },
              {
                id: "reason",
                label: t("clinical:referrals.cancel.rationale"),
                value: <span className="whitespace-pre-wrap">{cancelled.reason}</span>,
              },
              {
                id: "actor",
                label: t("clinical:referrals.drawer.cancelledBy"),
                value: (
                  <span data-testid="referral-cancelled-by">
                    {cancelEvent === null
                      ? t("clinical:referrals.drawer.actorUnknown")
                      : t("clinical:referrals.drawer.byAt", {
                          name: personaName(cancelEvent.actorId) ?? "—",
                          when: formatDateTime(cancelEvent.occurredAt, language),
                        })}
                  </span>
                ),
              },
            ]}
          />
        </section>
      ) : null}

      <section aria-labelledby="referral-history-title" className="space-y-2">
        <h3 id="referral-history-title" className="micro-label text-muted m-0">
          {t("clinical:referrals.drawer.history")}
        </h3>
        {history.isPending ? (
          <LoadingSkeleton lines={3} />
        ) : history.isError ? (
          <InfoCallout>
            <p className="m-0" data-testid="referral-history-unavailable">
              {t("clinical:referrals.drawer.historyUnavailable")}
            </p>
          </InfoCallout>
        ) : events.length === 0 ? (
          <p className="text-muted m-0 text-[13px]">
            {t("clinical:referrals.drawer.historyEmpty")}
          </p>
        ) : (
          <HistoryList events={events} />
        )}
      </section>

      {action === "accept" || action === "schedule" || action === "edit" ? (
        <UpdateReferralDialog
          mode={action}
          referral={referral}
          open
          onOpenChange={(open) => {
            if (!open) setAction(null);
          }}
          nowIso={nowIso}
          onSaved={saved}
        />
      ) : null}
      {action === "complete" ? (
        <CompleteReferralDialog
          referral={referral}
          open
          onOpenChange={(open) => {
            if (!open) setAction(null);
          }}
          nowIso={nowIso}
          onSaved={saved}
        />
      ) : null}
      {action === "cancel" ? (
        <CancelReferralDialog
          referral={referral}
          open
          onOpenChange={(open) => {
            if (!open) setAction(null);
          }}
          nowIso={nowIso}
          onSaved={saved}
        />
      ) : null}
    </div>
  );
}

function historyDetail(event: AuditEvent, t: ReturnType<typeof useTx>): string | null {
  const summary = event.changeSummary as Record<string, unknown> | null;
  if (summary === null || typeof summary !== "object") return null;
  const parts: string[] = [];
  if (typeof summary["from"] === "string" && typeof summary["to"] === "string") {
    parts.push(
      t("clinical:referrals.drawer.historyTransition", {
        from: t(domainKey("status.referral", summary["from"] as Referral["status"])),
        to: t(domainKey("status.referral", summary["to"] as Referral["status"])),
      }),
    );
  }
  if (typeof summary["evidenceType"] === "string") {
    parts.push(
      t("clinical:referrals.drawer.historyEvidence", {
        type: t(`domain:evidence.${summary["evidenceType"]}` as TranslationKey),
        reference:
          typeof summary["evidenceReference"] === "string" ? summary["evidenceReference"] : "",
      }),
    );
  }
  if (Array.isArray(summary["fields"])) {
    parts.push(
      t("clinical:referrals.drawer.historyFields", {
        fields: (summary["fields"] as unknown[])
          .map((f) => t(`clinical:referrals.drawer.field.${String(f)}` as TranslationKey))
          .join(", "),
      }),
    );
  }
  return parts.length === 0 ? null : parts.join(" · ");
}

function HistoryList({ events }: { events: readonly AuditEvent[] }) {
  const t = useTx();
  const { language } = useLanguage();
  // Read events (`referral.viewed`) are left out: the history shows what happened to the referral.
  const items: TimelineItem[] = [...events]
    .filter((event) => !event.action.endsWith(".viewed"))
    .reverse()
    .map((event) => {
      const actor = personaName(event.actorId);
      const detail = historyDetail(event, t);
      return {
        id: event.id,
        dateLabel: formatDateTime(event.occurredAt, language),
        dateTime: event.occurredAt,
        title: t(`domain:audit.${event.action}` as TranslationKey),
        ...(detail === null && event.justification === null
          ? {}
          : {
              description: (
                <span className="flex flex-col gap-0.5">
                  {detail === null ? null : <span>{detail}</span>}
                  {event.justification === null ? null : (
                    <span className="whitespace-pre-wrap">
                      {t("clinical:referrals.drawer.historyReason", {
                        reason: event.justification,
                      })}
                    </span>
                  )}
                </span>
              ),
            }),
        meta:
          actor === null
            ? t("clinical:referrals.drawer.actorUnknown")
            : t("clinical:referrals.drawer.actor", { name: actor }),
      };
    });
  return (
    <div data-testid="referral-history">
      <Timeline label={t("clinical:referrals.drawer.history")} items={items} />
    </div>
  );
}
