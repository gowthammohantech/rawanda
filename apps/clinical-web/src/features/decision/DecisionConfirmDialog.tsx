/**
 * Confirm step (CLN-07 task 5): the FND-09 `ConfirmDialog` with a structured summary of the
 * decision — outcome, what will be created (or "nothing else"), due date in Kigali time, note /
 * reason — and the attribution line "Recorded by <name>, <role>, <facility> at hh:mm (Kigali)".
 * Confirm shows busy and is disabled while saving; the dialog cannot be dismissed while saving
 * (Escape / outside click / Cancel are blocked by `loading`).
 */
import { domainKey, formatDateTime, formatTime, useLanguage } from "@laif/i18n";
import { ConfirmDialog, KeyValueList, useTx, type KeyValueItem } from "@laif/ui-web";

import { facilityLabel } from "../../app/persona-labels.ts";
import type { DecisionVariables } from "./form.ts";

export type DecisionAttribution = {
  name: string;
  role: string;
  facility: string;
  /** Demo "now" (UTC ISO). */
  atIso: string;
};

export type DecisionConfirmDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  variables: DecisionVariables | null;
  attribution: DecisionAttribution;
  workerName: (id: string) => string;
  loading: boolean;
  onConfirm: () => unknown;
};

export function DecisionConfirmDialog({
  open,
  onOpenChange,
  variables,
  attribution,
  workerName,
  loading,
  onConfirm,
}: DecisionConfirmDialogProps) {
  const t = useTx();
  const { language } = useLanguage();
  const items: KeyValueItem[] = [];
  if (variables !== null) {
    items.push({
      id: "outcome",
      label: t("clinical:decision.confirm.summary.outcome"),
      value: t(`clinical:decision.outcomes.${variables.kind}.label`),
    });
    let creates: string;
    switch (variables.kind) {
      case "refer":
        creates = t("clinical:decision.confirm.summary.createsReferral", {
          destination: facilityLabel(variables.destinationFacilityId, t),
        });
        break;
      case "request_repeat_screening":
        creates = t("clinical:decision.confirm.summary.createsRepeat", {
          worker: workerName(variables.assignedWorkerId),
        });
        break;
      case "plan_follow_up":
        creates =
          variables.assignedWorkerId === undefined
            ? t("clinical:decision.confirm.summary.createsPlanned")
            : t("clinical:decision.confirm.summary.createsPlannedFor", {
                worker: workerName(variables.assignedWorkerId),
              });
        break;
      default:
        creates = t("clinical:decision.confirm.summary.createsNothing");
    }
    items.push({
      id: "creates",
      label: t("clinical:decision.confirm.summary.creates"),
      value: creates,
    });
    if (variables.kind === "refer") {
      items.push({
        id: "priority",
        label: t("clinical:decision.confirm.summary.priority"),
        value: t(domainKey("priority", variables.priority)),
      });
    }
    if ("dueAt" in variables && typeof variables.dueAt === "string") {
      items.push({
        id: "dueAt",
        label: t("clinical:decision.confirm.summary.dueAt"),
        value: formatDateTime(variables.dueAt, language),
      });
    }
    if (variables.kind === "dismiss") {
      items.push({
        id: "dismissReason",
        label: t("clinical:decision.confirm.summary.dismissReason"),
        value: t(`clinical:decision.fields.dismissReasonCode.${variables.dismissReasonCode}`),
      });
    }
    const note =
      variables.kind === "dismiss"
        ? variables.reason
        : variables.kind === "refer"
          ? variables.referralReason
          : variables.kind === "request_repeat_screening"
            ? variables.instructionsForWorker
            : (variables.note ?? "");
    if (note !== "") {
      items.push({
        id: "note",
        label: t("clinical:decision.confirm.summary.note"),
        value: <span className="whitespace-pre-wrap">{note}</span>,
      });
    }
    items.push({
      id: "reviewStatus",
      label: t("clinical:decision.confirm.summary.reviewStatus"),
      value: t(
        domainKey(
          "status.review",
          variables.kind === "dismiss" ? "dismissed_with_reason" : "action_recorded",
        ),
      ),
    });
  }

  return (
    <ConfirmDialog
      open={open}
      onOpenChange={onOpenChange}
      title={t("clinical:decision.confirm.title")}
      description={t("clinical:decision.confirm.description")}
      confirmLabel={t("clinical:decision.confirm.confirm")}
      cancelLabel={t("clinical:decision.confirm.cancel")}
      loading={loading}
      confirmDisabled={variables === null}
      onConfirm={() => onConfirm()}
    >
      <div data-testid="decision-confirm" className="space-y-3">
        <KeyValueList items={items} />
        <p data-testid="decision-attribution" className="text-muted m-0 text-[13px]">
          {t("clinical:decision.confirm.attribution", {
            name: attribution.name,
            role: attribution.role,
            facility: attribution.facility,
            time: formatTime(attribution.atIso, language),
          })}
        </p>
      </div>
    </ConfirmDialog>
  );
}
