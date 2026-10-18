/**
 * Small-number suppression threshold (ADM-09 task 2; FRD §7 configurable small-cell policy).
 *
 * - Programme lead (`settings.privacy`): integer 3–20 (never below the governance floor) + a
 *   justification (10–300 characters), react-hook-form + Zod with translated messages; one
 *   idempotency key per edit (reused by retries), `expectedVersion` = the loaded version.
 *   Success: toast "Threshold updated — dashboards recalculated" (`adminKeys.all` invalidated;
 *   every derived key and the CSV metadata carry the threshold). CONFLICT → ConflictNotice
 *   (keep latest / re-apply on latest).
 * - Everyone else: the value read-only with "Set by programme lead (demo policy, not approved
 *   for production)"; the repository rejects a direct call (`admin.settings.denied`).
 * - Live preview: "At k = {k}, {n} cells in the current Overview would be suppressed" (the
 *   overview of the current filters recomputed at the candidate k; counts only).
 */
import { zodResolver } from "@hookform/resolvers/zod";
import { actorForPersona, checkAccess } from "@laif/auth-demo";
import {
  ADMIN_THRESHOLD_MAX,
  ADMIN_THRESHOLD_MIN,
  SETTINGS_JUSTIFICATION_MAX,
  SETTINGS_JUSTIFICATION_MIN,
  type AdminSettings,
} from "@laif/contracts";
import type { ConflictResolution } from "@laif/domain";
import { formatDateTime, formatNumber, useLanguage } from "@laif/i18n";
import { isRepositoryError } from "@laif/repositories";
import {
  Button,
  Card,
  ConflictNotice,
  CONTROL_CLASS,
  cx,
  ErrorState,
  errorCodeOf,
  Icon,
  LoadingSkeleton,
  MicroLabel,
  useToast,
  useTx,
  type TranslationKey,
} from "@laif/ui-web";
import { useId, useState, type ReactNode } from "react";
import { useForm, useWatch } from "react-hook-form";
import { z } from "zod";

import { useAdminSession } from "../../app/providers.tsx";
import { findAdminPersona } from "../../auth/personas.ts";
import { useAdminFilters } from "../filters/useAdminFilters.ts";
import { useOverviewMetrics } from "../metrics/queries.ts";
import type { OverviewMetrics } from "../metrics/selectOverview.ts";
import { useAdminSettings, useUpdateThreshold } from "./queries.ts";

export type ThresholdFormValues = { threshold: string; justification: string };

const MSG = {
  range: "admin:settings.threshold.validation.range",
  unchanged: "admin:settings.threshold.validation.unchanged",
  justification: "admin:settings.threshold.validation.justification",
} as const satisfies Record<string, TranslationKey>;

/** Form rules (the same as the repository schema; messages are admin keys). */
export function thresholdFormSchema(current: number) {
  return z.object({ threshold: z.string(), justification: z.string() }).superRefine((v, ctx) => {
    const n = Number(v.threshold.trim());
    if (
      v.threshold.trim() === "" ||
      !Number.isInteger(n) ||
      n < ADMIN_THRESHOLD_MIN ||
      n > ADMIN_THRESHOLD_MAX
    ) {
      ctx.addIssue({ code: "custom", path: ["threshold"], message: MSG.range });
    } else if (n === current) {
      ctx.addIssue({ code: "custom", path: ["threshold"], message: MSG.unchanged });
    }
    const length = v.justification.trim().length;
    if (length < SETTINGS_JUSTIFICATION_MIN || length > SETTINGS_JUSTIFICATION_MAX) {
      ctx.addIssue({ code: "custom", path: ["justification"], message: MSG.justification });
    }
  });
}

/** Every suppressed cell the Overview publishes (KPI totals, facility rows, series, parts). */
export function overviewSuppressedCells(o: OverviewMetrics): number {
  const cells = [
    ...Object.values(o.totals),
    o.peopleScreened,
    ...o.facilities.flatMap((r) => Object.values(r.cells)),
    ...o.weekly.flatMap((w) => [w.screened, w.flagged]),
    ...o.screeningType.cells,
    o.needsAttention.overdueReferrals,
    o.needsAttention.overdueFollowUps,
    o.needsAttention.openQualityIssues,
    ...Object.values(o.needsAttention.pendingReviewAges),
  ];
  return cells.filter((c) => c.suppressed).length;
}

function useCanEditThreshold(): boolean {
  const persona = useAdminSession((s) => s.persona);
  const grant = useAdminSession((s) => s.grant);
  if (persona === null) return false;
  return checkAccess(actorForPersona(persona, { grant }), "settings.privacy").allowed;
}

export function SuppressionThresholdSetting({ createKey }: { createKey?: () => string }) {
  const t = useTx();
  const settings = useAdminSettings();
  const canEdit = useCanEditThreshold();
  return (
    <Card as="section" title={t("admin:settings.threshold.label")} className="flex flex-col gap-3">
      <div data-testid="threshold-setting" className="flex flex-col gap-3">
        <p className="text-muted m-0 text-[13px]">{t("admin:settings.threshold.description")}</p>
        {settings.isPending ? (
          <LoadingSkeleton variant="card" lines={3} />
        ) : settings.isError ? (
          <ErrorState
            code={errorCodeOf(settings.error) ?? "INTERNAL"}
            onRetry={() => settings.refetch()}
          />
        ) : canEdit ? (
          <ThresholdForm
            settings={settings.data}
            {...(createKey === undefined ? {} : { createKey })}
          />
        ) : (
          <ThresholdReadOnly settings={settings.data} />
        )}
      </div>
    </Card>
  );
}

function LastChanged({ settings }: { settings: AdminSettings }) {
  const t = useTx();
  const { language } = useLanguage();
  const by =
    settings.updatedBy === null
      ? t("admin:settings.threshold.baseline")
      : (findAdminPersona(settings.updatedBy)?.displayName ?? settings.updatedBy);
  return (
    <p className="text-muted m-0 text-xs" data-testid="threshold-last-changed">
      {t("admin:settings.threshold.lastChanged", {
        by,
        at: formatDateTime(settings.updatedAt, language),
        version: settings.version,
      })}
    </p>
  );
}

function ThresholdValue({ k }: { k: number }) {
  const t = useTx();
  const { language } = useLanguage();
  return (
    <p className="m-0 flex items-baseline gap-2">
      <span className="font-display text-ink text-[28px] font-semibold tabular-nums">
        {t("admin:settings.threshold.value", { k: formatNumber(k, language) })}
      </span>
      <MicroLabel tone="warning">{t("admin:settings.threshold.demoTag")}</MicroLabel>
    </p>
  );
}

function ThresholdReadOnly({ settings }: { settings: AdminSettings }) {
  const t = useTx();
  return (
    <div data-testid="threshold-readonly" className="flex flex-col gap-2">
      <ThresholdValue k={settings.suppressionThreshold} />
      <p className="text-ink m-0 flex items-start gap-2 text-[13px]">
        <Icon name="lock" size={16} className="text-muted mt-0.5 shrink-0" />
        {t("admin:settings.threshold.readOnly")}
      </p>
      <LastChanged settings={settings} />
    </div>
  );
}

function Field({
  id,
  label,
  hint,
  error,
  children,
}: {
  id: string;
  label: string;
  hint?: string;
  error?: string | undefined;
  children: (control: {
    id: string;
    "aria-invalid"?: true;
    "aria-describedby"?: string;
  }) => ReactNode;
}) {
  const t = useTx();
  const describedBy = [
    hint === undefined ? null : `${id}-hint`,
    error === undefined ? null : `${id}-error`,
  ]
    .filter((v): v is string => v !== null)
    .join(" ");
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={id} className="text-ink text-[13px] font-medium">
        {label}
        <span className="text-danger ms-1">
          <span aria-hidden="true">*</span>
          <span className="sr-only">{t("common:ui.required")}</span>
        </span>
      </label>
      {children({
        id,
        ...(error === undefined ? {} : { "aria-invalid": true as const }),
        ...(describedBy === "" ? {} : { "aria-describedby": describedBy }),
      })}
      {hint === undefined ? null : (
        <p id={`${id}-hint`} className="text-muted m-0 text-xs">
          {hint}
        </p>
      )}
      {error === undefined ? null : (
        <p
          id={`${id}-error`}
          className="text-danger m-0 flex items-center gap-1 text-xs font-medium"
        >
          <Icon name="alert" size={14} />
          {error}
        </p>
      )}
    </div>
  );
}

type ConflictState = { latest: AdminSettings; changedBy?: string; changedAt?: string };

function ThresholdForm({
  settings,
  createKey,
}: {
  settings: AdminSettings;
  createKey?: () => string;
}) {
  const t = useTx();
  const { language } = useLanguage();
  const { toast } = useToast();
  const baseId = useId();
  const newKey = () => (createKey ?? (() => crypto.randomUUID()))();
  const [key, setKey] = useState(newKey);
  const [failure, setFailure] = useState<"retry" | "forbidden" | "other" | null>(null);
  const [conflict, setConflict] = useState<ConflictState | null>(null);
  const [resolving, setResolving] = useState<ConflictResolution | null>(null);
  const mutation = useUpdateThreshold();
  const form = useForm<ThresholdFormValues>({
    resolver: zodResolver(thresholdFormSchema(settings.suppressionThreshold)),
    defaultValues: { threshold: String(settings.suppressionThreshold), justification: "" },
    shouldFocusError: true,
  });
  const { register, handleSubmit, formState, control, reset, setError } = form;
  const thresholdText = useWatch({ control, name: "threshold" });
  const justification = useWatch({ control, name: "justification" });
  const candidate = Number(thresholdText);
  const candidateValid =
    Number.isInteger(candidate) &&
    candidate >= ADMIN_THRESHOLD_MIN &&
    candidate <= ADMIN_THRESHOLD_MAX;
  const errorText = (field: keyof ThresholdFormValues): string | undefined => {
    const message = formState.errors[field]?.message;
    if (message === undefined || message === "") return undefined;
    return t(message as TranslationKey, {
      min: field === "threshold" ? ADMIN_THRESHOLD_MIN : SETTINGS_JUSTIFICATION_MIN,
      max: field === "threshold" ? ADMIN_THRESHOLD_MAX : SETTINGS_JUSTIFICATION_MAX,
    });
  };

  const save = async (values: ThresholdFormValues, opts?: { key: string; version: number }) => {
    setFailure(null);
    try {
      const result = await mutation.mutateAsync({
        key: opts?.key ?? key,
        input: {
          expectedVersion: opts?.version ?? settings.version,
          suppressionThreshold: Number(values.threshold),
          justification: values.justification.trim(),
        },
      });
      toast({ title: t("admin:settings.threshold.toast.saved"), tone: "positive" });
      setConflict(null);
      setKey(newKey());
      reset({ threshold: String(result.data.suppressionThreshold), justification: "" });
    } catch (error) {
      if (isRepositoryError(error) && error.code === "CONFLICT" && error.conflict) {
        setConflict({
          latest: error.conflict.latest as AdminSettings,
          ...(error.conflict.changedBy === undefined
            ? {}
            : { changedBy: error.conflict.changedBy }),
          ...(error.conflict.changedAt === undefined
            ? {}
            : { changedAt: error.conflict.changedAt }),
        });
        return;
      }
      if (isRepositoryError(error) && error.code === "VALIDATION_ERROR" && error.fieldErrors) {
        if (error.fieldErrors["suppressionThreshold"] !== undefined) {
          setError("threshold", { type: "server", message: MSG.range });
        }
        if (error.fieldErrors["justification"] !== undefined) {
          setError("justification", { type: "server", message: MSG.justification });
        }
        return;
      }
      if (isRepositoryError(error) && error.code === "FORBIDDEN") setFailure("forbidden");
      else if (
        isRepositoryError(error) &&
        ["TIMEOUT", "OFFLINE", "INTERNAL", "DEPENDENCY_UNAVAILABLE"].includes(error.code)
      ) {
        setFailure("retry");
      } else setFailure("other");
    }
  };

  const resolve = async (resolution: ConflictResolution) => {
    if (conflict === null) return;
    if (resolution === "keep_latest") {
      setConflict(null);
      setKey(newKey());
      mutation.reset();
      reset({ threshold: String(conflict.latest.suppressionThreshold), justification: "" });
      return;
    }
    setResolving(resolution);
    const fresh = newKey();
    setKey(fresh);
    await save(form.getValues(), { key: fresh, version: conflict.latest.version });
    setResolving(null);
  };

  return (
    <form
      noValidate
      data-testid="threshold-form"
      onSubmit={(event) => {
        event.preventDefault();
        if (!mutation.isPending) void handleSubmit((values) => save(values))();
      }}
      className="flex flex-col gap-4"
    >
      <ThresholdValue k={settings.suppressionThreshold} />
      <LastChanged settings={settings} />
      <Field
        id={`${baseId}-k`}
        label={t("admin:settings.threshold.newValue")}
        hint={t("admin:settings.threshold.hint", {
          min: ADMIN_THRESHOLD_MIN,
          max: ADMIN_THRESHOLD_MAX,
        })}
        error={errorText("threshold")}
      >
        {(c) => (
          <input
            {...c}
            {...register("threshold")}
            type="number"
            inputMode="numeric"
            min={ADMIN_THRESHOLD_MIN}
            max={ADMIN_THRESHOLD_MAX}
            step={1}
            className={cx(CONTROL_CLASS, "border-border max-w-40")}
          />
        )}
      </Field>
      {candidateValid ? <ThresholdPreview k={candidate} /> : null}
      <Field
        id={`${baseId}-why`}
        label={t("admin:settings.threshold.justification")}
        hint={t("admin:settings.threshold.justificationHint", {
          min: SETTINGS_JUSTIFICATION_MIN,
          max: SETTINGS_JUSTIFICATION_MAX,
          count: formatNumber(justification.trim().length, language),
        })}
        error={errorText("justification")}
      >
        {(c) => (
          <textarea
            {...c}
            {...register("justification")}
            rows={3}
            className={cx(CONTROL_CLASS, "border-border")}
          />
        )}
      </Field>
      <p className="text-muted m-0 text-xs">{t("admin:settings.threshold.auditNote")}</p>
      {conflict === null ? null : (
        <ConflictNotice
          title={t("admin:settings.threshold.conflict.title")}
          description={t("admin:settings.threshold.conflict.description")}
          {...(conflict.changedBy === undefined
            ? {}
            : {
                changedBy: findAdminPersona(conflict.changedBy)?.displayName ?? conflict.changedBy,
              })}
          {...(conflict.changedAt === undefined ? {} : { changedAt: conflict.changedAt })}
          rows={[
            {
              id: "threshold",
              label: t("admin:settings.threshold.label"),
              yours: String(form.getValues("threshold")),
              latest: String(conflict.latest.suppressionThreshold),
              changed:
                String(form.getValues("threshold")) !==
                String(conflict.latest.suppressionThreshold),
            },
          ]}
          resolving={resolving}
          onResolve={(r) => resolve(r)}
        />
      )}
      {failure === null ? null : (
        <p
          role="alert"
          data-testid="threshold-error"
          className="border-danger/30 bg-danger-soft text-ink m-0 rounded-sm border px-3 py-2 text-[13px] font-semibold"
        >
          {failure === "retry"
            ? t("admin:settings.threshold.notSaved")
            : failure === "forbidden"
              ? t("admin:settings.threshold.forbidden")
              : t("admin:settings.threshold.failed")}
        </p>
      )}
      <div>
        <Button
          type="submit"
          variant="primary"
          loading={mutation.isPending}
          disabled={conflict !== null}
        >
          {failure === "retry" ? t("common:actions.retry") : t("admin:settings.threshold.save")}
        </Button>
      </div>
    </form>
  );
}

/** "At k = {k}, {n} cells in the current Overview would be suppressed" (counts only). */
function ThresholdPreview({ k }: { k: number }) {
  const t = useTx();
  const { language } = useLanguage();
  const api = useAdminFilters();
  const query = useOverviewMetrics(api, k);
  return (
    <p
      role="status"
      aria-live="polite"
      data-testid="threshold-preview"
      className="border-border-soft bg-background text-ink m-0 rounded-sm border px-3 py-2 text-[13px]"
    >
      {query.isPending
        ? t("admin:settings.threshold.previewLoading")
        : query.isError
          ? t("admin:settings.threshold.previewUnavailable")
          : t("admin:settings.threshold.preview", {
              k: formatNumber(k, language),
              n: formatNumber(overviewSuppressedCells(query.data), language),
            })}
    </p>
  );
}
