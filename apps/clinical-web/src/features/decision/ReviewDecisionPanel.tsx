/**
 * The decision form body (CLN-07 tasks 2, 9): a radio-card group of the five outcomes (FND-02
 * decision kinds, native radios → arrow keys move between them) and the field group of the chosen
 * outcome only.
 *
 * - Initial: nothing preselected, Save disabled until an outcome is chosen.
 * - Choosing an outcome clears every other field (and its errors); a pointer / Space choice moves
 *   focus to the first field of the group (arrow-key browsing keeps focus on the radios).
 * - Save → RHF + the FND-03 contract (`createDecisionFormSchema`); invalid → translated field
 *   errors + an error summary at the top (focused, anchor links to each field). Valid →
 *   `onValid(variables)` (the page opens the confirm dialog). `Ctrl/⌘ + Enter` = Save.
 * - Wording never prescribes treatment; outcome copy only says what will be recorded / created.
 */
import { RadioCardGroup, Button, Icon, useTx, type RadioCardOption } from "@laif/ui-web";
import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { useWatch, type FieldErrors } from "react-hook-form";

import {
  DECISION_KINDS,
  FIELDS_BY_KIND,
  fieldDomId,
  valuesForKind,
  type DecisionFieldName,
  type DecisionFormOutput,
  type DecisionFormValues,
  type DecisionKind,
} from "./form.ts";
import { AssessmentFields } from "./fields/AssessmentFields.tsx";
import { DismissFields } from "./fields/DismissFields.tsx";
import { PlannedReviewFields } from "./fields/PlannedReviewFields.tsx";
import { ReferFields } from "./fields/ReferFields.tsx";
import { RepeatTestFields } from "./fields/RepeatTestFields.tsx";
import type { DecisionForm, WorkerOptionsState } from "./fields/shared.tsx";

export type ReviewDecisionPanelProps = {
  form: DecisionForm;
  nowIso: string;
  workers: WorkerOptionsState;
  /** Valid values → open the confirm step. */
  onValid: (variables: DecisionFormOutput, values: DecisionFormValues) => void;
  /** Save disabled (offline, conflict shown, saving) — with the reason shown next to it. */
  saveDisabled?: boolean;
  saveDisabledReason?: ReactNode;
  /** Extra actions left of Save (e.g. Back to review). */
  secondaryAction?: ReactNode;
};

const ARROW_KEYS = new Set(["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"]);

type Tx = ReturnType<typeof useTx>;

function fieldLabel(name: DecisionFieldName | "kind", kind: DecisionKind | "", t: Tx): string {
  switch (name) {
    case "kind":
      return t("clinical:decision.errorSummary.kind");
    case "note":
      return t("clinical:decision.fields.clinicalNote");
    case "destinationFacilityId":
      return t("clinical:decision.fields.destination");
    case "referralReason":
      return t("clinical:decision.fields.referralReason");
    case "dueAt":
      return t("clinical:decision.fields.dueAt");
    case "priority":
      return t("clinical:decision.fields.priority");
    case "assignedWorkerId":
      return kind === "plan_follow_up"
        ? t("clinical:decision.fields.assignedWorkerOptional")
        : t("clinical:decision.fields.assignedWorker");
    case "instructionsForWorker":
      return t("clinical:decision.fields.instructions");
    case "dismissReasonCode":
      return t("clinical:decision.fields.dismissReasonCode.label");
    case "reason":
      return t("clinical:decision.fields.dismissRationale");
  }
}

function ErrorSummary({
  errors,
  kind,
  summaryRef,
}: {
  errors: FieldErrors<DecisionFormValues>;
  kind: DecisionKind | "";
  summaryRef: (node: HTMLDivElement | null) => void;
}) {
  const t = useTx();
  const names: (DecisionFieldName | "kind")[] = [
    "kind",
    ...(kind === "" ? [] : FIELDS_BY_KIND[kind]),
  ];
  const listed = names.filter((name) => errors[name] !== undefined);
  if (listed.length === 0) return null;
  return (
    <div
      ref={summaryRef}
      tabIndex={-1}
      role="alert"
      data-testid="decision-error-summary"
      className="border-danger/30 bg-danger-soft space-y-2 rounded-md border p-3 text-[13px]"
    >
      <p className="text-danger m-0 flex items-center gap-1.5 font-semibold">
        <Icon name="alert" size={16} />
        {t("clinical:decision.errorSummary.title", { count: listed.length })}
      </p>
      <ul className="m-0 list-disc space-y-1 ps-5">
        {listed.map((name) => (
          <li key={name}>
            <a
              href={`#${fieldDomId(name)}`}
              className="text-ink underline"
              onClick={(event) => {
                event.preventDefault();
                const target = document.getElementById(fieldDomId(name));
                const focusable =
                  target?.matches("input, select, textarea") === true
                    ? target
                    : target?.querySelector<HTMLElement>("input, select, textarea");
                focusable?.focus();
              }}
            >
              {fieldLabel(name, kind, t)}
            </a>
          </li>
        ))}
      </ul>
    </div>
  );
}

export function ReviewDecisionPanel({
  form,
  nowIso,
  workers,
  onValid,
  saveDisabled = false,
  saveDisabledReason,
  secondaryAction,
}: ReviewDecisionPanelProps) {
  const t = useTx();
  const kind = useWatch({ control: form.control, name: "kind" });
  const [summaryRequest, setSummaryRequest] = useState(0);
  const summaryRef = useRef<HTMLDivElement | null>(null);
  const groupRef = useRef<HTMLDivElement | null>(null);
  const arrowNav = useRef(false);
  const focusGroup = useRef(false);

  // Focus the error summary after an invalid Save — whether it is already mounted (effect) or
  // mounts with the errors in a later render (callback ref).
  const pendingSummaryFocus = useRef(false);
  const attachSummary = useCallback((node: HTMLDivElement | null) => {
    summaryRef.current = node;
    if (node !== null && pendingSummaryFocus.current) {
      pendingSummaryFocus.current = false;
      node.focus();
    }
  }, []);
  useEffect(() => {
    if (summaryRequest === 0 || !pendingSummaryFocus.current || summaryRef.current === null) return;
    pendingSummaryFocus.current = false;
    summaryRef.current.focus();
  }, [summaryRequest]);

  useEffect(() => {
    if (!focusGroup.current || kind === "") return;
    focusGroup.current = false;
    groupRef.current?.querySelector<HTMLElement>("input, select, textarea")?.focus();
  }, [kind]);

  const choose = (next: DecisionKind) => {
    if (next === kind) return;
    focusGroup.current = !arrowNav.current;
    arrowNav.current = false;
    form.reset(valuesForKind(next));
  };

  const save = () => {
    if (kind === "" || saveDisabled) return;
    void form.handleSubmit(
      (variables) => onValid(variables, form.getValues()),
      () => {
        pendingSummaryFocus.current = true;
        setSummaryRequest((n) => n + 1);
      },
    )();
  };

  // Ctrl/⌘ + Enter anywhere in the form = Save (opens the confirm step).
  const formRef = useRef<HTMLFormElement | null>(null);
  const saveRef = useRef(save);
  useEffect(() => {
    saveRef.current = save;
  });
  useEffect(() => {
    const element = formRef.current;
    if (element === null) return undefined;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Enter" && (event.ctrlKey || event.metaKey)) {
        event.preventDefault();
        saveRef.current();
      }
    };
    element.addEventListener("keydown", onKeyDown);
    return () => element.removeEventListener("keydown", onKeyDown);
  }, []);

  const options: RadioCardOption<DecisionKind>[] = DECISION_KINDS.map((value) => ({
    value,
    label: t(`clinical:decision.outcomes.${value}.label`),
    description: t(`clinical:decision.outcomes.${value}.description`),
  }));

  const fieldProps = { form, nowIso, disabled: false };
  const group = (() => {
    switch (kind) {
      case "no_further_action":
        return <AssessmentFields {...fieldProps} />;
      case "refer":
        return <ReferFields {...fieldProps} />;
      case "request_repeat_screening":
        return <RepeatTestFields {...fieldProps} workers={workers} />;
      case "plan_follow_up":
        return <PlannedReviewFields {...fieldProps} workers={workers} />;
      case "dismiss":
        return <DismissFields {...fieldProps} />;
      default:
        return null;
    }
  })();

  return (
    <form
      ref={formRef}
      noValidate
      data-testid="decision-form"
      aria-label={t("clinical:decision.title")}
      className="space-y-5"
      onSubmit={(event) => {
        event.preventDefault();
        save();
      }}
    >
      <ErrorSummary errors={form.formState.errors} kind={kind} summaryRef={attachSummary} />

      <div
        id={fieldDomId("kind")}
        data-testid="decision-outcomes"
        onKeyDownCapture={(event) => {
          arrowNav.current = ARROW_KEYS.has(event.key);
        }}
        onPointerDownCapture={() => {
          arrowNav.current = false;
        }}
      >
        <RadioCardGroup<DecisionKind>
          // `required` would put aria-required on the <fieldset> (axe aria-allowed-attr), so the
          // required marker is part of the legend instead.
          legend={
            <>
              {t("clinical:decision.legend")}
              <span className="text-danger ms-1">
                <span aria-hidden="true">*</span>
                <span className="sr-only">{t("common:ui.required")}</span>
              </span>
            </>
          }
          name="decision-outcome"
          columns={1}
          options={options}
          value={kind === "" ? null : kind}
          onChange={choose}
          error={form.formState.errors.kind}
        />
      </div>

      {kind === "" ? null : (
        <section
          ref={groupRef}
          aria-label={t("clinical:decision.fields.groupTitle", {
            outcome: t(`clinical:decision.outcomes.${kind}.label`),
          })}
          data-testid="decision-fields"
          data-kind={kind}
          className="border-border-soft space-y-4 border-t pt-4"
        >
          {group}
        </section>
      )}

      <div className="flex flex-wrap items-center justify-end gap-3">
        {saveDisabled && saveDisabledReason !== undefined ? (
          <span className="text-muted text-[13px]">{saveDisabledReason}</span>
        ) : kind === "" ? (
          <span className="text-muted text-[13px]">
            {t("clinical:decision.actions.selectOutcomeFirst")}
          </span>
        ) : (
          <span className="text-muted text-[13px]">{t("clinical:decision.actions.saveHint")}</span>
        )}
        {secondaryAction}
        <Button
          type="submit"
          variant="primary"
          data-testid="decision-save"
          disabled={kind === "" || saveDisabled}
        >
          {t("clinical:decision.actions.save")}
        </Button>
      </div>
    </form>
  );
}
