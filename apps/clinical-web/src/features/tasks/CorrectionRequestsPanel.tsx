/**
 * Record correction requests routed to the facility's clinicians (CTZ-07 → CLN-09): care tasks of
 * kind `correction_request` (`listTasks({ kinds: ['correction_request'] })`). Each shows what the
 * citizen asked for (description + suggested text), the record it concerns and its state.
 * `Start review` (`start` → citizen sees "in review"); `Resolve` (`complete` with a
 * `resolutionKey` from the FND-02 `CORRECTION_RESOLUTION_KEYS` vocabulary — the citizen only ever
 * sees approved copy for that key, never staff free text). Resolving never edits the clinical
 * record; an actual correction is made separately (screening amendment with reason, CLN-04).
 */
import {
  CORRECTION_RESOLUTION_KEYS,
  CORRECTION_RESOLUTION_STATUS,
  type CorrectionResolutionKey,
} from "@laif/domain";
import { domainKey, formatDateTime, useLanguage } from "@laif/i18n";
import {
  Button,
  Card,
  ConfirmDialog,
  EmptyState,
  KeyValueList,
  LoadingSkeleton,
  Select,
  StatusChip,
  useToast,
  useTx,
} from "@laif/ui-web";
import { vMsg } from "@laif/contracts";
import { useState } from "react";

import { QueryErrorState } from "../../components/QueryErrorState.tsx";
import { clinicalErrorKeys } from "../../data/errors.ts";
import type { PatientNames } from "../referrals/hooks.ts";
import { personaName } from "../timeline/people.ts";
import { useCorrectionRequests, useUpdateTask, type CorrectionTask } from "./hooks.ts";
import { TaskFeedback } from "./TaskDialogFrame.tsx";

export function CorrectionRequestsPanel({
  patients,
  canResolve,
  offline,
}: {
  patients: PatientNames | undefined;
  canResolve: boolean;
  offline: boolean;
}) {
  const t = useTx();
  const { language } = useLanguage();
  const query = useCorrectionRequests();
  const [resolving, setResolving] = useState<CorrectionTask | null>(null);
  const start = useUpdateTask();
  const { toast } = useToast();

  const open = (query.data ?? []).filter((r) => r.status === "open" || r.status === "in_progress");

  return (
    <Card title={t("clinical:tasks.corrections.title")}>
      <div className="space-y-3" data-testid="correction-requests">
        <p className="text-muted m-0 text-[13px]">{t("clinical:tasks.corrections.body")}</p>
        {query.isPending ? (
          <LoadingSkeleton lines={3} />
        ) : query.isError ? (
          <QueryErrorState error={query.error} onRetry={() => void query.refetch()} />
        ) : open.length === 0 ? (
          <EmptyState icon="check" title={t("clinical:tasks.corrections.empty")} />
        ) : (
          <ul className="m-0 list-none space-y-3 p-0">
            {open.map((request) => (
              <li
                key={request.id}
                data-testid="correction-request"
                data-task-id={request.id}
                className="border-border-soft space-y-2 rounded-md border p-3"
              >
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-ink font-semibold">
                    {request.patientId === null
                      ? "—"
                      : (patients?.get(request.patientId)?.displayName ?? request.patientId)}
                  </span>
                  <StatusChip tone={request.status === "open" ? "info" : "warning"}>
                    {t(domainKey("status.careTask", request.status))}
                  </StatusChip>
                </div>
                <KeyValueList
                  items={[
                    {
                      id: "target",
                      label: t("clinical:tasks.corrections.target"),
                      value: t(domainKey("entityType", request.payload.targetType)),
                    },
                    {
                      id: "description",
                      label: t("clinical:tasks.corrections.description"),
                      value: (
                        <span className="whitespace-pre-wrap">{request.payload.description}</span>
                      ),
                    },
                    ...(typeof request.payload.suggestedValue === "string" &&
                    request.payload.suggestedValue !== ""
                      ? [
                          {
                            id: "suggested",
                            label: t("clinical:tasks.corrections.suggested"),
                            value: request.payload.suggestedValue,
                          },
                        ]
                      : []),
                    {
                      id: "requested",
                      label: t("clinical:tasks.corrections.requested"),
                      value: t("clinical:tasks.drawer.byAt", {
                        name: personaName(request.createdBy) ?? "—",
                        when: formatDateTime(request.createdAt, language),
                      }),
                    },
                  ]}
                />
                {canResolve ? (
                  <div className="flex flex-wrap gap-2">
                    {request.status === "open" ? (
                      <Button
                        variant="secondary"
                        size="sm"
                        disabled={offline}
                        loading={start.isSubmitting}
                        data-testid="correction-start"
                        onClick={async () => {
                          const result = await start.submit({
                            taskId: request.id,
                            expectedVersion: request.version,
                            action: "start",
                          });
                          if (result !== undefined) {
                            toast({
                              tone: "positive",
                              title: t("clinical:tasks.toast.correctionStarted"),
                            });
                          }
                        }}
                      >
                        {t("clinical:tasks.corrections.start")}
                      </Button>
                    ) : (
                      <Button
                        size="sm"
                        disabled={offline}
                        data-testid="correction-resolve"
                        onClick={() => setResolving(request)}
                      >
                        {t("clinical:tasks.corrections.resolve")}
                      </Button>
                    )}
                  </div>
                ) : null}
              </li>
            ))}
          </ul>
        )}
        {start.error !== null ? (
          start.error.code === "CONFLICT" ? (
            <p role="alert" className="text-danger m-0 text-[13px]">
              {t("clinical:tasks.corrections.conflict")}
            </p>
          ) : (
            <TaskFeedback
              error={start.error}
              canRetry={start.canRetry}
              retrying={start.isSubmitting}
              onRetry={() => start.retry()}
            />
          )
        ) : null}
      </div>
      {resolving === null ? null : (
        <ResolveCorrectionDialog request={resolving} onClose={() => setResolving(null)} />
      )}
    </Card>
  );
}

function ResolveCorrectionDialog({
  request,
  onClose,
}: {
  request: CorrectionTask;
  onClose: () => void;
}) {
  const t = useTx();
  const { toast } = useToast();
  const [key, setKey] = useState<CorrectionResolutionKey | "">("");
  const [error, setError] = useState<string | undefined>(undefined);
  const mutation = useUpdateTask();
  const close = () => {
    mutation.reset();
    onClose();
  };
  const confirm = async () => {
    if (key === "") {
      setError(vMsg("required"));
      return;
    }
    setError(undefined);
    const result = await mutation.submit({
      taskId: request.id,
      expectedVersion: request.version,
      action: "complete",
      resolutionKey: key,
    });
    if (result === undefined) return;
    toast({ tone: "positive", title: t("clinical:tasks.toast.correctionResolved") });
    close();
  };
  return (
    <ConfirmDialog
      open
      onOpenChange={(next) => {
        if (!next) close();
      }}
      title={t("clinical:tasks.corrections.resolveTitle")}
      description={t("clinical:tasks.corrections.resolveBody")}
      confirmLabel={t("clinical:tasks.corrections.resolveConfirm")}
      loading={mutation.isSubmitting}
      onConfirm={() => confirm()}
    >
      <div className="space-y-3" data-testid="resolve-correction-form">
        <Select
          id="correction-resolution"
          label={t("clinical:tasks.corrections.outcome")}
          hint={t("clinical:tasks.corrections.outcomeHint")}
          required
          placeholder={t("clinical:tasks.dialog.choose")}
          options={CORRECTION_RESOLUTION_KEYS.map((value) => ({
            value,
            label: t(`clinical:tasks.corrections.resolution.${value}`),
          }))}
          value={key}
          error={error}
          onChange={(event) => setKey(event.target.value as CorrectionResolutionKey | "")}
        />
        {key === "" ? null : (
          <p className="text-muted m-0 text-[13px]" data-testid="correction-citizen-status">
            {t("clinical:tasks.corrections.citizenSees", {
              status: t(`clinical:tasks.corrections.status.${CORRECTION_RESOLUTION_STATUS[key]}`),
            })}
          </p>
        )}
        {mutation.error?.code === "CONFLICT" ? (
          <p role="alert" className="text-danger m-0 text-[13px]">
            {t("clinical:tasks.corrections.conflict")}
          </p>
        ) : mutation.error !== null && mutation.error.code !== "VALIDATION_ERROR" ? (
          <TaskFeedback
            error={mutation.error}
            canRetry={mutation.canRetry}
            retrying={mutation.isSubmitting}
            onRetry={() => mutation.retry()}
          />
        ) : mutation.error !== null ? (
          <p role="alert" className="text-danger m-0 text-[13px]">
            {t(clinicalErrorKeys("VALIDATION_ERROR").title)}
          </p>
        ) : null}
      </div>
    </ConfirmDialog>
  );
}
