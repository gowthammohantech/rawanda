/**
 * `/clinical/reviews/:id` (CLN-06, ref-image 2): why a screening was flagged and who is
 * responsible, before any decision.
 *
 * - Breadcrumb `Review queue › <synthetic ID>`; `<h1>` "Review detail" (the patient name never
 *   lands in the document title); status pill next to the title.
 * - Header actions: `Open patient` + the primary action — `Start review` (pending) → `Record
 *   decision` (in review by me) → hidden (decided). Needs `review.decide`; a coordinator sees the
 *   evidence read-only with "Decisions require a clinician or authorised reviewer". In review by
 *   someone else → "In review by <name>" + `Take over review` (ConfirmDialog, mandatory reason →
 *   `review.taken_over`).
 * - `Start review` is version-checked (`expectedVersion`); a stale version or the simulated
 *   conflict → `ConflictPanel` (reload latest / cancel) — nothing is overwritten. Other failures →
 *   toast + inline retry with the SAME idempotency key. Offline → disabled with the reason.
 * - Out-of-scope id → `FORBIDDEN` (+ `access.denied` by the repository) → permission denied with
 *   no review data; unknown id → not-found state. `review.viewed` is audited by `getReview`.
 */
import {
  explainFlag,
  isReviewOpen,
  type EvidenceSnapshot,
  type Review,
  type ReviewStatus,
} from "@laif/domain";
import { domainKey } from "@laif/i18n";
import { DEMO_RULESET_V1 } from "@laif/mock-data";
import type { ReviewDetail } from "@laif/repositories";
import {
  Button,
  Card,
  ConfirmDialog,
  EmptyState,
  KeyValueList,
  LoadingSkeleton,
  PermissionDenied,
  StatusChip,
  useToast,
  useTx,
  type Tone,
} from "@laif/ui-web";
import { useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { Link, useNavigate, useParams } from "react-router";

import { useDemoTools } from "../../app/demo-tools.tsx";
import { routes } from "../../app/routes.ts";
import { ConflictPanel } from "../../components/ConflictPanel.tsx";
import { PageHeader } from "../../components/PageHeader.tsx";
import { QueryErrorState } from "../../components/QueryErrorState.tsx";
import { clinicalErrorKeys, toClinicalError } from "../../data/errors.ts";
import { clinicalKeys } from "../../data/queryKeys.ts";
import { useSession } from "../../session/useSession.ts";
import { personaName } from "../timeline/people.ts";
import { EvidencePanel } from "./EvidencePanel.tsx";
import { HowToReadCallout } from "./HowToReadCallout.tsx";
import { rulesetFor, useReview, useStartReview } from "./hooks.ts";
import { PriorRecordsCard } from "./PriorRecordsCard.tsx";
import { ProvenanceCard } from "./ProvenanceCard.tsx";
import { ResponsibilityCard } from "./ResponsibilityCard.tsx";
import { ReviewFlagHeader } from "./ReviewFlagHeader.tsx";

const STATUS_TONE: Record<ReviewStatus, Tone> = {
  pending: "warning",
  in_review: "info",
  action_recorded: "positive",
  dismissed_with_reason: "neutral",
};

const linkClass =
  "text-primary-dark target-min inline-flex items-center text-sm font-semibold underline";

function isValidSnapshot(value: unknown): value is EvidenceSnapshot {
  const snap = value as Partial<EvidenceSnapshot> | null | undefined;
  return (
    typeof snap === "object" &&
    snap !== null &&
    typeof snap.flag === "object" &&
    snap.flag !== null &&
    typeof snap.inputs === "object" &&
    snap.inputs !== null
  );
}

export function ReviewStatusPill({ status }: { status: ReviewStatus }) {
  const t = useTx();
  return (
    <span data-testid="review-status" data-status={status} className="inline-flex">
      <StatusChip
        key={status}
        tone={STATUS_TONE[status]}
        className="uppercase motion-safe:transition-colors motion-safe:duration-500"
      >
        {t(domainKey("status.review", status))}
      </StatusChip>
    </span>
  );
}

function OutcomeCard({ review }: { review: Review }) {
  const t = useTx();
  const { can } = useSession();
  const decision = review.decision;
  return (
    <Card title={t("clinical:review.outcome.title")}>
      <div data-testid="review-outcome" className="space-y-3">
        <p className="text-muted m-0 text-sm">{t("clinical:review.outcome.body")}</p>
        <KeyValueList
          items={[
            {
              id: "decision",
              label: t("clinical:review.outcome.decision"),
              value:
                decision === null
                  ? t(domainKey("status.review", review.status))
                  : t(domainKey("decision", decision.kind)),
            },
            ...(decision?.reasonCode === undefined
              ? []
              : [
                  {
                    id: "reasonCode",
                    label: t("clinical:review.outcome.reason"),
                    value: t(domainKey("dismissReason", decision.reasonCode)),
                  },
                ]),
            ...((decision?.note ?? review.decisionReason ?? "") === ""
              ? []
              : [
                  {
                    id: "note",
                    label: t("clinical:review.outcome.note"),
                    value: decision?.note ?? review.decisionReason ?? "",
                  },
                ]),
          ]}
        />
        {can("audit.read") ? (
          <Link to={routes.audit()} className={linkClass}>
            {t("clinical:review.outcome.auditTrail")}
          </Link>
        ) : null}
      </div>
    </Card>
  );
}

function LoadingLayout() {
  const t = useTx();
  return (
    <div
      aria-busy="true"
      aria-label={t("clinical:review.loading")}
      data-testid="review-loading"
      className="grid gap-4 lg:grid-cols-3"
    >
      <div className="space-y-4 lg:col-span-2">
        <LoadingSkeleton variant="card" lines={4} />
        <LoadingSkeleton variant="card" lines={5} />
      </div>
      <div className="space-y-4">
        <LoadingSkeleton variant="card" lines={4} />
        <LoadingSkeleton variant="card" lines={4} />
      </div>
    </div>
  );
}

export function ReviewDetailPage() {
  const t = useTx();
  const { id = "" } = useParams();
  const query = useReview(id);

  const queueCrumb = { label: t("clinical:nav.queue"), to: routes.queue() };
  const simpleHeader = (
    <PageHeader
      title={t("clinical:review.title")}
      breadcrumbs={[queueCrumb, { label: t("clinical:review.title") }]}
    />
  );

  if (query.isPending) {
    return (
      <>
        {simpleHeader}
        <LoadingLayout />
      </>
    );
  }

  // A failed REFETCH (e.g. simulated offline) keeps showing the last loaded review.
  if (query.isError && query.data === undefined) {
    const error = toClinicalError(query.error);
    return (
      <>
        {simpleHeader}
        {error.code === "FORBIDDEN" ? (
          <div data-testid="permission-denied" data-reason="review-scope">
            <PermissionDenied
              message={t("clinical:review.denied.body")}
              action={
                <Link to={routes.queue()} className={linkClass}>
                  {t("clinical:review.notFound.back")}
                </Link>
              }
            />
          </div>
        ) : (
          <QueryErrorState error={query.error} onRetry={() => void query.refetch()} />
        )}
      </>
    );
  }

  if (query.data === null || query.data === undefined) {
    return (
      <>
        {simpleHeader}
        <div data-testid="review-not-found">
          <EmptyState
            icon="search"
            title={t("clinical:review.notFound.title")}
            description={t("clinical:review.notFound.description")}
            action={
              <Link to={routes.queue()} className={linkClass}>
                {t("clinical:review.notFound.back")}
              </Link>
            }
          />
        </div>
      </>
    );
  }

  return <ReviewDetailLoaded detail={query.data} />;
}

function ReviewDetailLoaded({ detail }: { detail: ReviewDetail }) {
  const t = useTx();
  const navigate = useNavigate();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { persona, activeFacilityId, can } = useSession();
  const { faultConfig } = useDemoTools();
  const { review, screening, patient } = detail;
  const me = persona?.id ?? null;
  const [takeOverOpen, setTakeOverOpen] = useState(false);
  const [reloading, setReloading] = useState(false);

  const snapshot = isValidSnapshot(review.evidenceSnapshot) ? review.evidenceSnapshot : null;
  const rulesetVersion = snapshot?.flag.rulesetVersion ?? screening?.rulesetVersion ?? "—";
  const ruleset = rulesetFor(rulesetVersion);
  const explanation = useMemo(
    () =>
      snapshot === null
        ? null
        : explainFlag(snapshot, screening, {
            version: rulesetVersion,
            requiredInputs: ruleset?.requiredInputs ?? DEMO_RULESET_V1.requiredInputs,
          }),
    [snapshot, screening, rulesetVersion, ruleset],
  );
  const amendedAfterFlag =
    snapshot !== null &&
    screening !== null &&
    screening.amendments.some((a) => a.amendedAt > snapshot.capturedAt);
  const historyHref = routes.patient(review.patientId, "screenings");

  const start = useStartReview({
    onSuccess: (saved) => {
      const tookOver = saved.startedBy === me && review.status === "in_review";
      toast({
        tone: "positive",
        title: tookOver
          ? t("clinical:review.actions.takenOver")
          : t("clinical:review.actions.started"),
        description: t("clinical:review.actions.startedBody"),
      });
    },
    onError: (failure) => {
      if (failure.code === "CONFLICT") {
        setTakeOverOpen(false);
        return;
      }
      if (failure.code === "VALIDATION_ERROR") return;
      toast({
        tone: "danger",
        title: t("clinical:review.actions.startFailed"),
        description: t(clinicalErrorKeys(failure.code).title),
      });
    },
  });
  const error = start.error;
  const conflict = error?.code === "CONFLICT" ? (error.conflict ?? null) : null;
  const failed = error !== null && error.code !== "CONFLICT";

  const onStart = async (takeOverReason?: string) => {
    const result = await start.submit({
      reviewId: review.id,
      expectedVersion: review.version,
      ...(takeOverReason === undefined ? {} : { takeOverReason }),
    });
    if (result !== undefined) setTakeOverOpen(false);
  };

  const reload = async () => {
    setReloading(true);
    try {
      await queryClient.invalidateQueries({
        queryKey: clinicalKeys.review(activeFacilityId ?? "none", review.id),
      });
      start.reset();
    } finally {
      setReloading(false);
    }
  };

  const open = isReviewOpen(review);
  const canDecide = can("review.decide");
  const offline = faultConfig.offline;
  const mine = review.status === "in_review" && review.startedBy === me;
  const otherReviewer =
    review.status === "in_review" && review.startedBy !== me
      ? (personaName(review.startedBy) ?? personaName(review.assignedClinicianId) ?? "—")
      : null;
  const reviewable = explanation !== null && explanation.items.length > 0;

  let primary = null;
  if (!canDecide) {
    primary = (
      <p data-testid="read-only-coordinator" className="text-muted m-0 text-sm">
        {t("clinical:review.actions.readOnlyCoordinator")}
      </p>
    );
  } else if (open && reviewable) {
    if (review.status === "pending") {
      primary = (
        <Button
          variant="primary"
          data-testid="start-review"
          loading={start.isSubmitting}
          disabled={offline || conflict !== null}
          title={offline ? t("clinical:review.actions.offline") : undefined}
          onClick={() => onStart()}
        >
          {t("clinical:review.actions.start")}
        </Button>
      );
    } else if (mine) {
      primary = (
        <Button
          variant="primary"
          data-testid="record-decision"
          icon="arrow"
          iconPosition="end"
          onClick={() => navigate(routes.decision(review.id))}
        >
          {t("clinical:review.actions.recordDecision")}
        </Button>
      );
    } else if (otherReviewer !== null) {
      primary = (
        <>
          <Button variant="primary" disabled data-testid="in-review-by">
            {t("clinical:review.actions.inReviewBy", { name: otherReviewer })}
          </Button>
          <ConfirmDialog
            open={takeOverOpen}
            onOpenChange={setTakeOverOpen}
            trigger={
              <Button
                variant="secondary"
                data-testid="take-over"
                disabled={offline || conflict !== null}
              >
                {t("clinical:review.actions.takeOver")}
              </Button>
            }
            title={t("clinical:review.actions.takeOverTitle")}
            description={t("clinical:review.actions.takeOverDescription", { name: otherReviewer })}
            requireReason
            reasonLabel={t("clinical:review.actions.takeOverReason")}
            confirmLabel={t("clinical:review.actions.takeOverConfirm")}
            loading={start.isSubmitting}
            onConfirm={(reason) => onStart(reason)}
          />
        </>
      );
    }
  }

  const actions = (
    <div className="flex flex-wrap items-center justify-end gap-2">
      {patient !== null && can("patient.read") ? (
        <Button
          variant="secondary"
          data-testid="open-patient"
          onClick={() => navigate(routes.patient(patient.id))}
        >
          {t("clinical:review.actions.openPatient")}
        </Button>
      ) : null}
      {primary}
    </div>
  );

  const crumb = patient?.syntheticIdentifier ?? review.id;
  return (
    <>
      <PageHeader
        title={t("clinical:review.title")}
        breadcrumbs={[{ label: t("clinical:nav.queue"), to: routes.queue() }, { label: crumb }]}
        subtitle={
          patient === null
            ? undefined
            : t("clinical:review.patientLine", {
                name: patient.displayName,
                syntheticId: patient.syntheticIdentifier,
              })
        }
        titleAdornment={<ReviewStatusPill status={review.status} />}
        actions={actions}
      />

      <div className="space-y-4" data-testid="review-detail" data-review-id={review.id}>
        {offline && open && canDecide ? (
          <p role="status" data-testid="start-offline" className="text-risk-warning m-0 text-sm">
            {t("clinical:review.actions.offline")}
          </p>
        ) : null}

        {conflict !== null ? (
          <ConflictPanel
            conflict={conflict}
            title={t("clinical:review.conflict.title")}
            description={t("clinical:review.conflict.description")}
            reloading={reloading}
            onReload={() => reload()}
            onCancel={() => start.reset()}
            rows={conflictRows(review, conflict.latest as Review | null, conflict, t, me)}
          />
        ) : null}

        {failed ? (
          <section
            role="alert"
            data-testid="start-failed"
            className="border-risk-danger/25 bg-risk-danger-soft space-y-2 rounded-md border p-3 text-[13px]"
          >
            <p className="text-risk-danger m-0 font-semibold">
              {t("clinical:review.actions.startFailed")}
            </p>
            <p className="text-ink m-0">{t(clinicalErrorKeys(error.code).body)}</p>
            {start.canRetry ? (
              <Button
                variant="secondary"
                size="sm"
                icon="refresh"
                loading={start.isSubmitting}
                onClick={() =>
                  start.retry().then((result) => {
                    if (result !== undefined) setTakeOverOpen(false);
                  })
                }
              >
                {t("clinical:review.actions.retry")}
              </Button>
            ) : null}
          </section>
        ) : null}

        <div className="grid gap-4 lg:grid-cols-3">
          <div className="min-w-0 space-y-4 lg:col-span-2">
            {snapshot !== null && explanation !== null ? (
              <ReviewFlagHeader
                review={review}
                snapshot={snapshot}
                completeness={explanation.completeness}
                ruleset={ruleset}
              />
            ) : null}
            <EvidencePanel
              items={explanation?.items ?? []}
              flag={snapshot?.flag ?? null}
              rulesetVersion={rulesetVersion}
              amendedAfterFlag={amendedAfterFlag}
              historyHref={historyHref}
            />
            <HowToReadCallout />
            <PriorRecordsCard
              patientId={review.patientId}
              currentScreeningId={screening?.id ?? null}
            />
          </div>
          <div className="min-w-0 space-y-4">
            {open ? null : <OutcomeCard review={review} />}
            <ResponsibilityCard review={review} myPersonaId={me} />
            <ProvenanceCard screening={screening} historyHref={historyHref} />
          </div>
        </div>
      </div>
    </>
  );
}

type Tx = ReturnType<typeof useTx>;

function conflictRows(
  yours: Review,
  latest: Review | null,
  conflict: { expectedVersion: number; currentVersion: number },
  t: Tx,
  me: string | null,
) {
  const who = (id: string | null | undefined) => {
    const name = personaName(id ?? null);
    if (name === null) return t("clinical:review.responsibility.unassigned");
    return id === me ? t("clinical:review.responsibility.you", { name }) : name;
  };
  return [
    {
      id: "status",
      label: t("clinical:review.conflict.fields.status"),
      yours: t(domainKey("status.review", yours.status)),
      latest: latest === null ? "—" : t(domainKey("status.review", latest.status)),
    },
    {
      id: "assigned",
      label: t("clinical:review.conflict.fields.assigned"),
      yours: who(yours.startedBy ?? yours.assignedClinicianId),
      latest: latest === null ? "—" : who(latest.startedBy ?? latest.assignedClinicianId),
    },
    {
      id: "version",
      label: t("clinical:review.conflict.fields.version"),
      yours: `v${conflict.expectedVersion}`,
      latest: `v${conflict.currentVersion}`,
    },
  ];
}
