/**
 * `/clinical/reviews/:id/decision` (CLN-07): record exactly one attributable decision for a review
 * the current user has IN REVIEW. Route guarded by `review.decide` (coordinator → audited
 * permission denied); an out-of-scope review → `FORBIDDEN` (no data); unknown → not found.
 *
 * - Pending, or in review by someone else → redirect to the review detail with a toast.
 * - Already decided → the existing decision read-only (`DecisionSuccess` mode `already`). When a
 *   draft of THIS browser tab was submitted (reload mid-submit, T-09), its exact variables are
 *   re-sent with the draft's idempotency key: the repository answers with the stored result
 *   (`replayed`) → success state, never a second decision.
 * - Form (`ReviewDecisionPanel`) → `DecisionConfirmDialog` → `decideReview` (one key per form
 *   session, double click = one call, Confirm busy + dialog not dismissible while saving).
 * - Errors: VALIDATION_ERROR → field errors; CONFLICT → `ConflictPanel` (Reload / Discard my
 *   draft; nothing overwritten), `ALREADY_DECIDED` → existing decision read-only;
 *   TIMEOUT / OFFLINE / DEPENDENCY_UNAVAILABLE → "Not saved yet" + Retry with the same key;
 *   FORBIDDEN → permission denied (worker not authorised → field error).
 * - Drafts autosave to sessionStorage (500 ms) and offer "Restore unsaved decision draft?".
 * - Simulated offline → Save disabled, "Saved as draft on this browser".
 */
import { zodResolver } from "@hookform/resolvers/zod";
import { roleLabelKey } from "@laif/auth-demo";
import { vMsg, type ValidationMessageParams } from "@laif/contracts";
import { DEMO_CLOCK_DEFAULT_ISO, isReviewOpen, type Referral, type Review } from "@laif/domain";
import { domainKey } from "@laif/i18n";
import type { ReviewDetail } from "@laif/repositories";
import {
  Button,
  Card,
  EmptyState,
  Icon,
  InfoCallout,
  LoadingSkeleton,
  PermissionDenied,
  useToast,
  useTx,
} from "@laif/ui-web";
import { useQueryClient } from "@tanstack/react-query";
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useForm, useWatch, type Resolver } from "react-hook-form";
import { Link, useNavigate, useParams } from "react-router";

import { MEDIA, useMediaQuery } from "../../app/useMediaQuery.ts";
import { useDemoTools } from "../../app/demo-tools.tsx";
import { facilityLabel } from "../../app/persona-labels.ts";
import { routes } from "../../app/routes.ts";
import { ConflictPanel } from "../../components/ConflictPanel.tsx";
import { PageHeader } from "../../components/PageHeader.tsx";
import { AsyncBoundary } from "../../components/AsyncBoundary.tsx";
import type { ClinicalError } from "../../data/errors.ts";
import { clinicalKeys } from "../../data/queryKeys.ts";
import { useSession } from "../../session/useSession.ts";
import { useReview } from "../reviews/hooks.ts";
import { personaName } from "../timeline/people.ts";
import { DecisionConfirmDialog } from "./DecisionConfirmDialog.tsx";
import { DecisionEvidenceSummary } from "./DecisionEvidenceSummary.tsx";
import { DecisionSuccess, type DecisionSuccessMode } from "./DecisionSuccess.tsx";
import {
  createDecisionFormSchema,
  EMPTY_DECISION_VALUES,
  type DecisionFormOutput,
  type DecisionFormValues,
  type DecisionVariables,
} from "./form.ts";
import { useDecideReview, useDemoNow, useWorkers } from "./hooks.ts";
import { ReviewDecisionPanel } from "./ReviewDecisionPanel.tsx";
import { useDecisionDraft } from "./useDecisionDraft.ts";

const linkClass =
  "text-primary-dark target-min inline-flex items-center text-sm font-semibold underline";

function LoadingLayout() {
  const t = useTx();
  return (
    <div
      role="group"
      aria-busy="true"
      aria-label={t("clinical:decision.loading")}
      data-testid="decision-loading"
      className="grid gap-4 lg:grid-cols-3"
    >
      <div className="lg:col-span-2">
        <LoadingSkeleton variant="card" lines={6} />
      </div>
      <LoadingSkeleton variant="card" lines={5} />
    </div>
  );
}

export function DecisionPage() {
  const t = useTx();
  const { id = "" } = useParams();
  const query = useReview(id);
  const header = (
    <PageHeader
      title={t("clinical:decision.title")}
      breadcrumbs={[
        { label: t("clinical:nav.queue"), to: routes.queue() },
        { label: t("clinical:review.title"), to: routes.review(id) },
        { label: t("clinical:decision.title") },
      ]}
    />
  );

  const backLink = (
    <Link to={routes.queue()} className={linkClass}>
      {t("clinical:review.notFound.back")}
    </Link>
  );
  const notFound = (
    <div data-testid="review-not-found">
      <EmptyState
        icon="search"
        title={t("clinical:review.notFound.title")}
        description={t("clinical:review.notFound.description")}
        action={backLink}
      />
    </div>
  );
  const body = (
    <AsyncBoundary
      query={query}
      testId="decision-query"
      loadingFallback={<LoadingLayout />}
      permissionFallback={
        <div data-testid="permission-denied" data-reason="review-scope">
          <PermissionDenied message={t("clinical:review.denied.body")} action={backLink} />
        </div>
      }
      isEmpty={(detail) => detail === null}
      emptyFallback={notFound}
      notFoundFallback={notFound}
    >
      {(detail) =>
        detail === null ? notFound : <DecisionLoaded key={detail.review.id} detail={detail} />
      }
    </AsyncBoundary>
  );

  return (
    <>
      {header}
      {body}
    </>
  );
}

type Tx = ReturnType<typeof useTx>;

function reviewConflictRows(yours: Review, latest: Review | null, t: Tx) {
  const decidedBy = (review: Review | null) =>
    review === null ? "—" : (personaName(review.decision?.decidedBy ?? review.reviewedBy) ?? "—");
  return [
    {
      id: "status",
      label: t("clinical:decision.conflict.fields.status"),
      yours: t(domainKey("status.review", yours.status)),
      latest: latest === null ? "—" : t(domainKey("status.review", latest.status)),
    },
    {
      id: "decision",
      label: t("clinical:decision.conflict.fields.decision"),
      yours: yours.decision === null ? "—" : t(domainKey("decision", yours.decision.kind)),
      latest:
        latest?.decision === null || latest?.decision === undefined
          ? "—"
          : t(domainKey("decision", latest.decision.kind)),
    },
    {
      id: "decidedBy",
      label: t("clinical:decision.conflict.fields.decidedBy"),
      yours: decidedBy(yours),
      latest: decidedBy(latest),
    },
    {
      id: "version",
      label: t("clinical:decision.conflict.fields.version"),
      yours: `v${yours.version}`,
      latest: latest === null ? "—" : `v${latest.version}`,
    },
  ];
}

function DecisionLoaded({ detail }: { detail: ReviewDetail }) {
  const t = useTx();
  const navigate = useNavigate();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { persona, activeFacilityId } = useSession();
  const { faultConfig } = useDemoTools();
  const { review } = detail;
  const compact = useMediaQuery(MEDIA.belowLg);
  const me = persona?.id ?? null;
  const open = isReviewOpen(review);
  const mine = review.status === "in_review" && review.startedBy === me;

  const draft = useDecisionDraft(review.id, review.version);
  const [mode, setMode] = useState<DecisionSuccessMode | null>(null);
  const [alreadyNotice, setAlreadyNotice] = useState(false);
  const [restorePrompt, setRestorePrompt] = useState(
    () => draft.initial !== null && draft.initial.values.kind !== "" && open,
  );
  const [confirm, setConfirm] = useState<{
    variables: DecisionVariables;
    values: DecisionFormValues;
  } | null>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [reloading, setReloading] = useState(false);
  const [expectedVersion, setExpectedVersion] = useState(
    () => draft.initial?.expectedVersion ?? review.version,
  );

  const now = useDemoNow();
  const nowIso = now.data ?? DEMO_CLOCK_DEFAULT_ISO;
  const workersQuery = useWorkers(review.facilityId);
  const workerName = useCallback(
    (id: string) =>
      workersQuery.data?.find((w) => w.id === id)?.displayName ?? personaName(id) ?? id,
    [workersQuery.data],
  );

  // Stable resolver over the latest demo "now" + expected version.
  const schemaContext = useRef({ nowIso, expectedVersion });
  useEffect(() => {
    schemaContext.current = { nowIso, expectedVersion };
  }, [nowIso, expectedVersion]);
  const resolver = useMemo<Resolver<DecisionFormValues, unknown, DecisionFormOutput>>(
    () => (values, context, options) =>
      zodResolver(
        createDecisionFormSchema({
          reviewId: review.id,
          idempotencyKey: draft.idempotencyKey,
          ...schemaContext.current,
        }),
      )(values, context, options as never),
    [review.id, draft.idempotencyKey],
  );
  const form = useForm<DecisionFormValues, unknown, DecisionFormOutput>({
    resolver,
    defaultValues: EMPTY_DECISION_VALUES,
    // The error summary takes focus instead (anchor links lead to each field).
    shouldFocusError: false,
  });

  const onError = useCallback(
    (failure: ClinicalError) => {
      setConfirmOpen(false);
      if (failure.code === "VALIDATION_ERROR") {
        for (const [name, message] of Object.entries(failure.fieldErrors ?? {})) {
          const field = (name in EMPTY_DECISION_VALUES ? name : "kind") as keyof DecisionFormValues;
          form.setError(field, {
            type: "server",
            message: vMsg(message.key, message.params as ValidationMessageParams),
          });
        }
        return;
      }
      if (failure.code === "FORBIDDEN" && failure.reason === "WORKER_NOT_AUTHORISED") {
        form.setError("assignedWorkerId", {
          type: "server",
          message: t("clinical:decision.errors.workerNotAuthorised"),
        });
        return;
      }
      if (failure.code === "CONFLICT" && failure.reason === "ALREADY_DECIDED") {
        draft.clear();
        setAlreadyNotice(true);
        void queryClient.invalidateQueries({
          queryKey: clinicalKeys.review(activeFacilityId ?? "none", review.id),
        });
      }
    },
    [form, t, draft, queryClient, activeFacilityId, review.id],
  );

  const decide = useDecideReview({
    initialKey: draft.idempotencyKey,
    onSuccess: (result) => {
      draft.clear();
      setConfirmOpen(false);
      setMode(result.replayed ? "replayed" : "fresh");
      toast({
        tone: "positive",
        title: t("clinical:decision.success.toast"),
        description: t("clinical:decision.success.toastBody"),
      });
    },
    onError,
  });

  // T-09: a submitted draft of a review that is now decided → replay with the same key.
  const probed = useRef(false);
  const [probing, setProbing] = useState(
    () => !open && draft.initial?.submitted !== null && draft.initial?.submitted !== undefined,
  );
  useEffect(() => {
    const submitted = draft.initial?.submitted ?? null;
    if (probed.current || open) return;
    if (submitted === null) {
      // An unsubmitted draft of a review that is already decided is stale.
      if (draft.initial !== null) draft.clear();
      return;
    }
    probed.current = true;
    void decide.submit(submitted).then((result) => {
      if (result === undefined) draft.clear();
      setProbing(false);
    });
  }, [open, draft, decide]);

  // Guard: only the clinician who has the review IN REVIEW can decide it.
  const redirect = open && !mine && mode === null;
  const redirected = useRef(false);
  useEffect(() => {
    if (!redirect || redirected.current) return;
    redirected.current = true;
    const other = review.status === "in_review";
    toast({
      tone: "warning",
      title: other
        ? t("clinical:decision.guard.otherReviewer", {
            name: personaName(review.startedBy) ?? "—",
          })
        : t("clinical:decision.guard.notStarted"),
      description: other
        ? t("clinical:decision.guard.otherReviewerBody")
        : t("clinical:decision.guard.notStartedBody"),
    });
    void navigate(routes.review(review.id), { replace: true });
  }, [redirect, review.status, review.startedBy, review.id, navigate, toast, t]);

  // Autosave (debounced) while the form is in use.
  const watched = useWatch({ control: form.control });
  useEffect(() => {
    if (restorePrompt || !open) return;
    if (watched.kind === "" || watched.kind === undefined) return;
    draft.saveValues({ ...EMPTY_DECISION_VALUES, ...watched });
  }, [watched, draft, restorePrompt, open]);

  const restore = () => {
    if (draft.initial !== null) form.reset(draft.initial.values);
    setRestorePrompt(false);
  };
  const discard = () => {
    draft.clear();
    draft.setExpectedVersion(review.version);
    setExpectedVersion(review.version);
    form.reset(EMPTY_DECISION_VALUES);
    decide.reset();
    setRestorePrompt(false);
    toast({ tone: "neutral", title: t("clinical:decision.draft.discarded") });
  };

  const reloadLatest = async (latest: Review | null) => {
    setReloading(true);
    try {
      const version = latest?.version ?? review.version;
      draft.setExpectedVersion(version);
      setExpectedVersion(version);
      await queryClient.invalidateQueries({
        queryKey: clinicalKeys.review(activeFacilityId ?? "none", review.id),
      });
      decide.reset();
    } finally {
      setReloading(false);
    }
  };

  const onValid = (variables: DecisionFormOutput, values: DecisionFormValues) => {
    decide.reset();
    setConfirm({ variables: { ...variables, expectedVersion }, values });
    setConfirmOpen(true);
  };

  const onConfirm = () => {
    if (confirm === null) return undefined;
    draft.markSubmitted(confirm.values, confirm.variables);
    return decide.submit(confirm.variables);
  };

  // ── Render ──────────────────────────────────────────────────────────────
  const sidebar = <DecisionEvidenceSummary detail={detail} />;
  // CLN-11: below 1024 px the evidence sidebar collapses into an "Evidence" disclosure above
  // the form (closed by default, so the decision form stays in view).
  const layout = (main: ReactNode) => (
    <div
      className="grid gap-4 lg:grid-cols-3"
      data-testid="decision-page"
      data-review-id={review.id}
    >
      {compact ? (
        <details
          data-testid="decision-evidence-disclosure"
          className="border-border-soft bg-surface shadow-card rounded-lg border"
        >
          <summary className="target-min text-ink flex cursor-pointer items-center gap-2 px-4 py-3 text-sm font-semibold">
            <Icon name="eye" size={16} />
            {t("clinical:decision.evidence.disclosure")}
          </summary>
          <div className="space-y-4 px-2 pb-2">{sidebar}</div>
        </details>
      ) : null}
      <div className="min-w-0 space-y-4 lg:col-span-2">{main}</div>
      {compact ? null : <div className="min-w-0 space-y-4">{sidebar}</div>}
    </div>
  );

  if (probing) return <LoadingLayout />;
  if (mode !== null || !open) {
    return layout(
      <>
        {alreadyNotice ? (
          <p
            role="alert"
            data-testid="already-decided"
            className="text-risk-warning m-0 text-sm font-medium"
          >
            {t("clinical:decision.errors.alreadyDecided")}
          </p>
        ) : null}
        <DecisionSuccess detail={detail} mode={mode ?? "already"} />
      </>,
    );
  }
  if (redirect) return <LoadingLayout />;

  const error = decide.error;
  if (error?.code === "FORBIDDEN" && error.reason !== "WORKER_NOT_AUTHORISED") {
    return (
      <div data-testid="permission-denied" data-reason="decide">
        <PermissionDenied message={t("clinical:review.denied.body")} />
      </div>
    );
  }
  const conflict =
    error?.code === "CONFLICT" && error.reason !== "ALREADY_DECIDED"
      ? (error.conflict ?? null)
      : null;
  const retryable = error !== null && error.retryable;
  const offline = faultConfig.offline;

  const attribution = {
    name: persona?.displayName ?? "—",
    role: persona === null ? "—" : t(roleLabelKey(persona.role)),
    facility: activeFacilityId === null ? "—" : facilityLabel(activeFacilityId, t),
    atIso: nowIso,
  };

  return layout(
    <>
      {restorePrompt ? (
        <div data-testid="draft-restore">
          <InfoCallout title={t("clinical:decision.draft.restorePrompt")}>
            <p className="m-0">{t("clinical:decision.draft.restoreBody")}</p>
            <div className="mt-3 flex flex-wrap gap-2">
              <Button variant="primary" size="sm" onClick={restore} data-testid="draft-restore-yes">
                {t("clinical:decision.draft.restore")}
              </Button>
              <Button variant="secondary" size="sm" onClick={discard} data-testid="draft-discard">
                {t("clinical:decision.draft.discard")}
              </Button>
            </div>
          </InfoCallout>
        </div>
      ) : null}

      {offline ? (
        <div data-testid="decision-offline" role="status">
          <InfoCallout title={t("clinical:decision.draft.offlineSaved")} icon="alert">
            <p className="m-0">{t("clinical:decision.draft.offlineBody")}</p>
          </InfoCallout>
        </div>
      ) : null}

      {conflict !== null ? (
        <ConflictPanel
          conflict={conflict}
          title={t("clinical:decision.conflict.title")}
          description={
            error?.reason === "REFERRAL_ALREADY_OPEN"
              ? t("clinical:decision.conflict.referralOpen")
              : t("clinical:decision.conflict.description")
          }
          reloading={reloading}
          cancelLabel={t("clinical:decision.conflict.discard")}
          onReload={() =>
            reloadLatest(
              conflict.entityType === "review" ? (conflict.latest as Review | null) : null,
            )
          }
          onCancel={() => {
            discard();
            void reloadLatest(
              conflict.entityType === "review" ? (conflict.latest as Review | null) : null,
            );
          }}
          rows={
            conflict.entityType === "review"
              ? reviewConflictRows(review, (conflict.latest as Review | null) ?? null, t)
              : [
                  {
                    id: "referral",
                    label: t("clinical:decision.success.referral"),
                    yours: "—",
                    latest: t(domainKey("status.referral", (conflict.latest as Referral).status)),
                  },
                ]
          }
        />
      ) : null}

      {retryable ? (
        <section
          role="alert"
          data-testid="decision-not-saved"
          className="border-risk-danger/25 bg-risk-danger-soft space-y-2 rounded-md border p-3 text-[13px]"
        >
          <p className="text-risk-danger m-0 font-semibold">
            {t("clinical:decision.errors.notSaved")}
          </p>
          <p className="text-ink m-0">{t("clinical:decision.errors.notSavedBody")}</p>
          {decide.canRetry ? (
            <Button
              variant="secondary"
              size="sm"
              icon="refresh"
              data-testid="decision-retry"
              loading={decide.isSubmitting}
              disabled={offline}
              onClick={() => decide.retry()}
            >
              {t("clinical:decision.actions.retry")}
            </Button>
          ) : null}
        </section>
      ) : null}

      {restorePrompt ? null : (
        <Card title={t("clinical:decision.title")}>
          <div className="space-y-4">
            <p className="text-muted m-0 text-[13px]">{t("clinical:decision.intro")}</p>
            <ReviewDecisionPanel
              form={form}
              nowIso={nowIso}
              workers={{ workers: workersQuery.data, loading: workersQuery.isPending }}
              onValid={onValid}
              saveDisabled={offline || conflict !== null || decide.isSubmitting}
              {...(offline
                ? { saveDisabledReason: t("clinical:decision.draft.offlineSaved") }
                : {})}
              secondaryAction={
                <Link to={routes.review(review.id)} className={linkClass}>
                  {t("clinical:decision.actions.cancel")}
                </Link>
              }
            />
          </div>
        </Card>
      )}

      <DecisionConfirmDialog
        open={confirmOpen}
        onOpenChange={(next) => {
          if (!decide.isSubmitting) setConfirmOpen(next);
        }}
        variables={confirm?.variables ?? null}
        attribution={attribution}
        workerName={workerName}
        loading={decide.isSubmitting}
        onConfirm={onConfirm}
      />
    </>,
  );
}
