/**
 * Report builder (ADM-07, ref image 4 stepper): 1 Template · 2 Preview · 3 Reason · 4 Export.
 * The period and scope come from the global filter bar.
 *
 * - Step 1: template cards (+ the record-level option, disabled: it needs data-governance
 *   approval) and the granularity.
 * - Step 2: the preview — exactly the CSV rows, with the dashboard's suppression.
 * - Step 3: the reason form (RHF + Zod; errors inline, focus on the first error).
 * - Step 4: summary and Export. The idempotency key and the export id are created when this step
 *   mounts and reused by every retry; the button is disabled while pending, so a double click or
 *   a timeout + retry produces one ExportAudit. Roles without `export.aggregate` see it disabled
 *   with "Your role cannot export" (the service still re-checks: FORBIDDEN + denied audit).
 * Keyboard: every step is a form / button sequence; the step heading takes focus on change.
 */
import type { ReportGranularity } from "@laif/analytics";
import type { ExportReason } from "@laif/contracts";
import { formatDate, useLanguage } from "@laif/i18n";
import { isRepositoryError } from "@laif/repositories";
import {
  Button,
  EmptyState,
  ErrorState,
  errorCodeOf,
  Icon,
  InfoCallout,
  KeyValueList,
  LoadingSkeleton,
  RadioCardGroup,
  Select,
  Stepper,
  useToast,
  useTx,
  type RadioCardOption,
  type TranslationKey,
} from "@laif/ui-web";
import { useQueryClient } from "@tanstack/react-query";
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useLocation } from "react-router";

import { districtLabel, facilityLabel } from "../../app/persona-labels.ts";
import { useServices } from "../../app/providers.tsx";
import { grantDistrictIds } from "../../auth/scope.ts";
import { adminKeys, scopeKeyOf } from "../../lib/queryKeys.ts";
import type { AdminFiltersApi } from "../filters/useAdminFilters.ts";
import { useSuppressionThreshold } from "../metrics/queries.ts";
import { reportRowsOf } from "./exportCsv.ts";
import { requestExport, type ExportResult } from "./exportService.ts";
import { clearDraftsOf, findDraft, saveDraft } from "../../lib/drafts.ts";
import { EMPTY_REASON, ExportReasonForm, type ExportReasonValues } from "./ExportReasonForm.tsx";
import { useClockMinute, useReportPreview } from "./queries.ts";
import { ReportPreviewTable, type PreviewRow } from "./ReportPreviewTable.tsx";
import {
  granularityOptions,
  REPORT_TEMPLATES,
  reportTemplate,
  type ReportTemplateId,
} from "./templates.ts";

const STEPS = ["template", "preview", "reason", "export"] as const;
type StepId = (typeof STEPS)[number];

/** The disabled de-identified record-level option (pending a data-governance decision). */
const RECORD_LEVEL = "record_level" as const;

type ExportAttempt = { key: string; exportId: string };

/** ADM-09 draft of the export flow (form input + attempt key; no figures). */
type ExportDraft = {
  template: ReportTemplateId;
  granularity: ReportGranularity;
  reasonValues: ExportReasonValues;
  attempt: ExportAttempt | null;
};

export type ReportBuilderProps = {
  api: AdminFiltersApi;
  canExport: boolean;
  initialTemplate: ReportTemplateId;
  /** Test seams. */
  createKey?: () => string;
  download?: (text: string, fileName: string) => void;
};

export function ReportBuilder({
  api,
  canExport,
  initialTemplate,
  createKey,
  download,
}: ReportBuilderProps) {
  const t = useTx();
  const { session } = useServices();
  const location = useLocation();
  // ADM-09 (T-09): an export reason (and export attempt key) left by an expired session on this
  // URL is restored at the reason step; an unchanged reason reuses the attempt key.
  const draftContext = `${location.pathname}${location.search}`;
  const [restore] = useState(() => findDraft<ExportDraft>("exportReason", draftContext));
  const make = useCallback(() => (createKey ?? (() => crypto.randomUUID()))(), [createKey]);
  const [step, setStep] = useState<StepId>(restore === null ? "template" : "reason");
  const [template, setTemplate] = useState<ReportTemplateId>(
    restore?.values.template ?? initialTemplate,
  );
  const [granularity, setGranularity] = useState<ReportGranularity>(
    restore?.values.granularity ?? "scope_total",
  );
  const [reasonValues, setReasonValues] = useState<ExportReasonValues>(
    restore?.values.reasonValues ?? EMPTY_REASON,
  );
  const [reason, setReason] = useState<ExportReason | null>(null);
  const [attempt, setAttempt] = useState<ExportAttempt | null>(restore?.values.attempt ?? null);
  const [draftKey] = useState(() => restore?.key ?? make());
  const saveExportDraft = (values: Partial<ExportDraft>) =>
    saveDraft<ExportDraft>({
      kind: "exportReason",
      context: draftContext,
      key: draftKey,
      subject: "report",
      values: { template, granularity, reasonValues, attempt, ...values },
    });
  const dropExportDraft = () => clearDraftsOf("exportReason", draftContext);
  const headingRef = useRef<HTMLHeadingElement>(null);
  const firstRender = useRef(true);

  const state = session.getState();
  const districtGrant =
    state.persona !== null && grantDistrictIds(state.persona, state.grant).length > 0;
  const options = granularityOptions(reportTemplate(template), {
    facility: api.filters.facility,
    districtGrant,
  });
  // Keep the granularity valid for the template / view.
  const effective =
    options.find((o) => o.value === granularity && !o.disabled)?.value ?? "scope_total";

  useEffect(() => {
    if (firstRender.current) {
      firstRender.current = false;
      return;
    }
    headingRef.current?.focus();
  }, [step]);

  const index = STEPS.indexOf(step);
  const go = (next: StepId) => setStep(next);

  return (
    <section
      className="border-border-soft bg-surface flex flex-col gap-4 rounded-lg border p-4"
      aria-labelledby="report-builder-heading"
      data-testid="report-builder"
    >
      <Stepper
        label={t("admin:reports.stepper.label")}
        currentIndex={index}
        steps={STEPS.map((id) => ({
          id,
          label: t(`admin:reports.stepper.${id}` as TranslationKey),
        }))}
      />
      <h2
        id="report-builder-heading"
        ref={headingRef}
        tabIndex={-1}
        className="font-display text-ink m-0 text-lg font-semibold outline-none"
        data-testid="report-step-heading"
      >
        {t("admin:reports.stepper.heading", {
          n: index + 1,
          total: STEPS.length,
          step: t(`admin:reports.stepper.${step}` as TranslationKey),
        })}
      </h2>

      {step === "template" ? (
        <TemplateStep
          template={template}
          onTemplate={setTemplate}
          granularity={effective}
          options={options}
          onGranularity={setGranularity}
          onNext={() => go("preview")}
        />
      ) : step === "preview" ? (
        <PreviewStep
          api={api}
          template={template}
          granularity={effective}
          onBack={() => go("template")}
          onNext={() => go("reason")}
        />
      ) : step === "reason" ? (
        <ExportReasonForm
          defaultValues={reasonValues}
          onBack={() => go("preview")}
          onChange={(values) => saveExportDraft({ reasonValues: values })}
          onSubmit={(parsed, values) => {
            // A changed reason is a new export attempt (new idempotency key).
            const same =
              attempt !== null && JSON.stringify(values) === JSON.stringify(reasonValues);
            const next = same && attempt !== null ? attempt : { key: make(), exportId: make() };
            setAttempt(next);
            setReason(parsed);
            setReasonValues(values);
            saveExportDraft({ reasonValues: values, attempt: next });
            go("export");
          }}
        />
      ) : reason === null ? null : (
        <ExportStep
          api={api}
          template={template}
          granularity={effective}
          reason={reason}
          canExport={canExport}
          attempt={attempt ?? { key: make(), exportId: make() }}
          onDone={dropExportDraft}
          onBack={() => go("reason")}
          onRestart={() => {
            setReason(null);
            setReasonValues(EMPTY_REASON);
            setAttempt(null);
            dropExportDraft();
            go("template");
          }}
          {...(download === undefined ? {} : { download })}
        />
      )}
    </section>
  );
}

function StepActions({ children }: { children: ReactNode }) {
  return <div className="flex flex-wrap justify-between gap-2">{children}</div>;
}

function TemplateStep({
  template,
  onTemplate,
  granularity,
  options,
  onGranularity,
  onNext,
}: {
  template: ReportTemplateId;
  onTemplate: (id: ReportTemplateId) => void;
  granularity: ReportGranularity;
  options: ReturnType<typeof granularityOptions>;
  onGranularity: (g: ReportGranularity) => void;
  onNext: () => void;
}) {
  const t = useTx();
  const cards: RadioCardOption<ReportTemplateId | typeof RECORD_LEVEL>[] = [
    ...REPORT_TEMPLATES.map((tpl) => ({
      value: tpl.id,
      label: t(`admin:reports.template.${tpl.id}.name` as TranslationKey),
      description: t(`admin:reports.template.${tpl.id}.description` as TranslationKey),
      icon: "file" as const,
    })),
    {
      value: RECORD_LEVEL,
      label: t("admin:reports.template.record_level.name"),
      description: t("admin:reports.recordLevelUnavailable"),
      icon: "lock" as const,
      disabled: true,
    },
  ];
  return (
    <form
      noValidate
      className="flex flex-col gap-4"
      onSubmit={(event) => {
        event.preventDefault();
        onNext();
      }}
    >
      <RadioCardGroup
        legend={t("admin:reports.template.legend")}
        name="report-template"
        columns={2}
        options={cards}
        value={template}
        onChange={(value) => {
          if (value !== RECORD_LEVEL) onTemplate(value);
        }}
      />
      <p className="text-muted m-0 text-xs" data-testid="record-level-note">
        {t("admin:reports.recordLevelNote")}
      </p>
      <Select
        label={t("admin:reports.granularity.label")}
        hint={t("admin:reports.granularity.hint")}
        value={granularity}
        onChange={(event) => onGranularity(event.target.value as ReportGranularity)}
        options={options.map((o) => ({
          value: o.value,
          label: o.disabled
            ? t("admin:reports.granularity.unavailable", {
                label: t(`admin:reports.granularity.${o.value}` as TranslationKey),
              })
            : t(`admin:reports.granularity.${o.value}` as TranslationKey),
          disabled: o.disabled,
        }))}
        fieldClassName="max-w-sm"
      />
      <StepActions>
        <span />
        <Button type="submit" icon="chevron" iconPosition="end">
          {t("admin:reports.stepper.next")}
        </Button>
      </StepActions>
    </form>
  );
}

function PreviewStep({
  api,
  template,
  granularity,
  onBack,
  onNext,
}: {
  api: AdminFiltersApi;
  template: ReportTemplateId;
  granularity: ReportGranularity;
  onBack: () => void;
  onNext: () => void;
}) {
  const t = useTx();
  const query = useReportPreview(api, template, granularity);
  const rows: PreviewRow[] = useMemo(() => {
    if (query.data === undefined) return [];
    const built = reportRowsOf(query.data, t);
    return built.map((row, i) => ({
      id: `${i}:${row.district_id ?? ""}:${row.facility_id ?? ""}:${row.week_start ?? ""}:${row.metric_id}`,
      row,
      reason: query.data.reasons[i] ?? null,
    }));
  }, [query.data, t]);
  const suppressed = rows.filter((r) => r.row.suppressed).length;
  const empty =
    query.data !== undefined &&
    rows.every((r) => !r.row.suppressed && (r.row.value === null || r.row.value === 0));

  return (
    <div className="flex flex-col gap-3" data-testid="report-preview">
      {query.isPending ? (
        <div data-testid="report-preview-loading" aria-busy="true">
          <LoadingSkeleton variant="table" lines={6} />
        </div>
      ) : query.isError ? (
        <ErrorState
          code={errorCodeOf(query.error) ?? "INTERNAL"}
          message={t("admin:reports.preview.error")}
          onRetry={() => query.refetch()}
        />
      ) : (
        <>
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs">
            <span className="text-ink font-medium" data-testid="preview-row-count">
              {t("admin:reports.preview.rows", { n: rows.length })}
            </span>
            <span className="text-muted" data-testid="preview-suppressed-count">
              {t("admin:reports.preview.suppressed", { n: suppressed })}
            </span>
            <span className="text-muted" data-testid="preview-legend">
              {t("admin:reports.preview.legend", { k: query.data.threshold })}
            </span>
          </div>
          {empty ? (
            <EmptyState
              icon="file"
              title={t("admin:reports.preview.emptyTitle")}
              description={t("admin:reports.preview.empty")}
            />
          ) : null}
          {rows.length > 0 ? (
            <ReportPreviewTable rows={rows} threshold={query.data.threshold} />
          ) : null}
        </>
      )}
      <StepActions>
        <Button variant="secondary" icon="chevron-left" onClick={onBack}>
          {t("admin:reports.stepper.back")}
        </Button>
        <Button
          icon="chevron"
          iconPosition="end"
          onClick={onNext}
          disabled={query.isPending || query.isError}
        >
          {t("admin:reports.stepper.next")}
        </Button>
      </StepActions>
    </div>
  );
}

type ExportStatus =
  | { kind: "idle" }
  | { kind: "error"; code: string }
  | { kind: "forbidden" }
  | { kind: "done"; result: ExportResult };

function ExportStep({
  api,
  template,
  granularity,
  reason,
  canExport,
  attempt,
  onDone,
  onBack,
  onRestart,
  download,
}: {
  api: AdminFiltersApi;
  template: ReportTemplateId;
  granularity: ReportGranularity;
  reason: ExportReason;
  canExport: boolean;
  /** Idempotency key + export id of this attempt (kept across retries and a re-login). */
  attempt: ExportAttempt;
  onDone: () => void;
  onBack: () => void;
  onRestart: () => void;
  download?: (text: string, fileName: string) => void;
}) {
  const t = useTx();
  const { language } = useLanguage();
  const { toast } = useToast();
  const services = useServices();
  const client = useQueryClient();
  const threshold = useSuppressionThreshold();
  const minute = useClockMinute();
  const generatedAt = useRef<Date | null>(null);
  const [pending, setPending] = useState(false);
  const [status, setStatus] = useState<ExportStatus>({ kind: "idle" });
  const deniedId = "export-denied-reason";

  const state = services.session.getState();
  const scope =
    api.filters.facility !== null
      ? facilityLabel(api.filters.facility, t)
      : api.filters.district !== null
        ? districtLabel(api.filters.district, t)
        : t("admin:reports.preview.allScope");

  const run = async () => {
    if (pending) return;
    generatedAt.current ??= services.clock.now();
    setPending(true);
    try {
      const result = await requestExport(
        {
          repo: services.repo,
          session: services.session,
          client,
          threshold,
          nowIso: `${minute}:00.000Z`,
          t,
          ...(download === undefined ? {} : { download }),
        },
        {
          template,
          granularity,
          filters: api.filters,
          period: api.period,
          reason,
          idempotencyKey: attempt.key,
          exportId: attempt.exportId,
          generatedAt: generatedAt.current,
        },
      );
      setStatus({ kind: "done", result });
      onDone();
      toast({
        title: t("admin:reports.toast.generated", { fileName: result.fileName }),
        tone: "positive",
      });
    } catch (error) {
      if (isRepositoryError(error) && error.code === "FORBIDDEN") {
        setStatus({ kind: "forbidden" });
        toast({ title: t("admin:reports.toast.forbidden"), tone: "danger" });
      } else {
        setStatus({ kind: "error", code: errorCodeOf(error) ?? "INTERNAL" });
      }
    } finally {
      setPending(false);
      // Denied attempts are listed too.
      void client.invalidateQueries({ queryKey: adminKeys.exports(scopeKeyOf(state.grant)) });
    }
  };

  const day = (iso: string) => formatDate(`${iso}T12:00:00.000Z`, language);

  return (
    <div className="flex flex-col gap-4" data-testid="export-step">
      <KeyValueList
        items={[
          {
            label: t("admin:reports.summary.template"),
            value: t(`admin:reports.template.${template}.name` as TranslationKey),
          },
          {
            label: t("admin:reports.summary.granularity"),
            value: t(`admin:reports.granularity.${granularity}` as TranslationKey),
          },
          {
            label: t("admin:reports.summary.period"),
            value: t("admin:reports.history.period", {
              from: day(api.period.from),
              to: day(api.period.to),
            }),
          },
          { label: t("admin:reports.summary.scope"), value: scope },
          {
            label: t("admin:reports.summary.reason"),
            value: t(`admin:reports.reason.code.${reason.reasonCode}` as TranslationKey),
          },
        ]}
      />
      <InfoCallout title={t("admin:reports.watermark.title")} icon="shield">
        {t("admin:reports.watermark.body", { k: threshold })}
      </InfoCallout>
      {status.kind === "error" ? (
        <div
          role="alert"
          data-testid="export-error"
          className="border-danger/30 bg-danger-soft text-ink flex items-start gap-2 rounded-sm border px-3 py-2 text-sm"
        >
          <Icon name="alert" size={16} className="text-danger mt-0.5" />
          <span>
            {t("admin:reports.error.notGenerated")}{" "}
            <span className="text-muted">
              {t("admin:reports.error.code", { code: status.code })}
            </span>
          </span>
        </div>
      ) : null}
      {status.kind === "forbidden" ? (
        <div
          role="alert"
          data-testid="export-forbidden"
          className="border-danger/30 bg-danger-soft text-ink rounded-sm border px-3 py-2 text-sm"
        >
          {t("admin:reports.error.forbidden")}
        </div>
      ) : null}
      {status.kind === "done" ? (
        <div
          role="status"
          data-testid="export-done"
          className="border-positive/30 bg-positive-soft text-ink flex items-start gap-2 rounded-sm border px-3 py-2 text-sm"
        >
          <Icon name="check" size={16} className="text-positive mt-0.5" />
          <span>
            {t("admin:reports.done", { fileName: status.result.fileName })}{" "}
            <span className="text-muted font-mono text-xs">
              {status.result.audit.sha256?.slice(0, 12)}
            </span>
          </span>
        </div>
      ) : null}
      {canExport ? null : (
        <p id={deniedId} className="text-muted m-0 flex items-center gap-1.5 text-sm">
          <Icon name="lock" size={14} />
          {t("admin:reports.denied.role")}
        </p>
      )}
      <StepActions>
        <Button variant="secondary" icon="chevron-left" onClick={onBack} disabled={pending}>
          {t("admin:reports.stepper.back")}
        </Button>
        <div className="flex flex-wrap gap-2">
          {status.kind === "done" ? (
            <Button variant="secondary" icon="refresh" onClick={onRestart}>
              {t("admin:reports.newReport")}
            </Button>
          ) : null}
          <Button
            icon="download"
            loading={pending}
            disabled={!canExport || pending}
            aria-describedby={canExport ? undefined : deniedId}
            onClick={() => run()}
            data-testid="export-button"
          >
            {status.kind === "error"
              ? t("admin:reports.retry")
              : status.kind === "done"
                ? t("admin:reports.downloadAgain")
                : t("admin:reports.export")}
          </Button>
        </div>
      </StepActions>
    </div>
  );
}
