/**
 * WF-02 conflict resolution (CLN-09 steps 3–5): shown when a save was rejected with `CONFLICT`
 * because someone else (e.g. the simulated worker) changed the same record. Field by field it
 * compares "Your change" with "Latest (by X at hh:mm)" and requires an EXPLICIT resolution —
 * nothing is overwritten silently:
 * - `Keep latest` → the local change is discarded (the caller refetches and audits
 *   `conflict.resolved` with `keep_latest` + the original idempotency key);
 * - `Re-apply my change on latest` → a second step shows the merged result (latest + your
 *   change); confirming re-submits with the LATEST version and a NEW key (the caller audits
 *   `conflict.resolved` with `reapply_on_latest`, linking the original key);
 * - `Cancel` → closes without resolving (the change is not saved).
 * Composes the FND-09 `ConfirmDialog` (focus trap, Escape, focus return).
 */
import type { ConflictDetails } from "@laif/contracts";
import type { ConflictResolution } from "@laif/domain";
import { formatTime, useLanguage } from "@laif/i18n";
import { Button, ConfirmDialog, StatusChip, cx, useTx } from "@laif/ui-web";
import { useState, type ReactNode } from "react";

import { personaName } from "../features/timeline/people.ts";

export type ConflictField = {
  id: string;
  /** Translated field label. */
  label: string;
  yours: ReactNode;
  latest: ReactNode;
  /** The value after re-applying your change on the latest version. */
  merged: ReactNode;
  /** Highlight the row (default: `yours !== latest` for primitives). */
  changed?: boolean;
};

export type ConflictResolutionDialogProps = {
  open: boolean;
  conflict: ConflictDetails<unknown>;
  fields: readonly ConflictField[];
  /** Summary of the change the user tried to save (e.g. "Reassign to X"). */
  change?: ReactNode;
  onKeepLatest: () => unknown;
  onReapply: () => unknown;
  onCancel: () => unknown;
  /** The resolution being applied (busy state; the dialog cannot be dismissed meanwhile). */
  busy?: ConflictResolution | null;
  /** False when the change cannot be applied to the latest version (reason shown instead). */
  canReapply?: boolean;
  reapplyBlockedReason?: ReactNode;
};

const isChanged = (field: ConflictField) =>
  field.changed ??
  ((typeof field.yours === "string" || typeof field.yours === "number") &&
    field.yours !== field.latest);

export function ConflictResolutionDialog({
  open,
  conflict,
  fields,
  change,
  onKeepLatest,
  onReapply,
  onCancel,
  busy = null,
  canReapply = true,
  reapplyBlockedReason,
}: ConflictResolutionDialogProps) {
  const t = useTx();
  const { language } = useLanguage();
  const [step, setStep] = useState<"compare" | "preview">("compare");
  // A new conflict (another change meanwhile) starts over at the comparison.
  const [seenVersion, setSeenVersion] = useState(conflict.currentVersion);
  if (seenVersion !== conflict.currentVersion) {
    setSeenVersion(conflict.currentVersion);
    setStep("compare");
  }

  const by = personaName(conflict.changedBy) ?? t("clinical:tasks.conflict.someone");
  const latestHeader =
    conflict.changedAt === undefined
      ? t("clinical:tasks.conflict.latestBy", { name: by })
      : t("clinical:tasks.conflict.latest", {
          name: by,
          time: formatTime(conflict.changedAt, language),
        });

  if (step === "preview") {
    return (
      <ConfirmDialog
        open={open}
        onOpenChange={(next) => {
          if (!next) setStep("compare");
        }}
        title={t("clinical:tasks.conflict.previewTitle")}
        description={t("clinical:tasks.conflict.previewBody", {
          version: conflict.currentVersion,
        })}
        confirmLabel={t("clinical:tasks.conflict.saveOnLatest")}
        cancelLabel={t("clinical:tasks.conflict.back")}
        loading={busy === "reapply_on_latest"}
        onConfirm={() => onReapply()}
      >
        <div data-testid="conflict-preview">
          <table className="w-full border-collapse text-[13px]">
            <caption className="sr-only">{t("clinical:tasks.conflict.previewTitle")}</caption>
            <thead>
              <tr>
                <th scope="col" className="micro-label text-muted py-2 text-start font-medium">
                  {t("clinical:tasks.conflict.field")}
                </th>
                <th scope="col" className="micro-label text-muted py-2 text-start font-medium">
                  {t("clinical:tasks.conflict.afterSave")}
                </th>
              </tr>
            </thead>
            <tbody>
              {fields.map((field) => (
                <tr key={field.id} className="border-border-soft border-t">
                  <th scope="row" className="text-muted py-2 pe-2 text-start font-medium">
                    {field.label}
                  </th>
                  <td className="text-ink py-2">{field.merged}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </ConfirmDialog>
    );
  }

  return (
    <ConfirmDialog
      open={open}
      onOpenChange={(next) => {
        if (!next) onCancel();
      }}
      title={t("clinical:tasks.conflict.title")}
      description={t("clinical:tasks.conflict.body")}
      confirmLabel={t("clinical:tasks.conflict.reapply")}
      cancelLabel={t("clinical:tasks.conflict.cancel")}
      loading={busy !== null}
      confirmDisabled={!canReapply}
      onConfirm={() => setStep("preview")}
    >
      <div className="space-y-3" data-testid="conflict-resolution">
        <div className="flex flex-wrap items-center gap-2">
          <StatusChip tone="danger" icon="alert">
            {t("domain:status.syncOp.conflict")}
          </StatusChip>
          <span className="text-muted text-xs" data-testid="conflict-versions">
            {t("clinical:tasks.conflict.versions", {
              yours: conflict.expectedVersion,
              latest: conflict.currentVersion,
            })}
          </span>
        </div>
        {change === undefined ? null : (
          <p className="text-ink m-0 text-[13px]" data-testid="conflict-change">
            {change}
          </p>
        )}
        <table className="w-full border-collapse text-[13px]">
          <caption className="sr-only">{t("clinical:tasks.conflict.title")}</caption>
          <thead>
            <tr>
              <th scope="col" className="micro-label text-muted w-1/4 py-2 text-start font-medium">
                {t("clinical:tasks.conflict.field")}
              </th>
              <th scope="col" className="micro-label text-muted py-2 text-start font-medium">
                {t("clinical:tasks.conflict.yours")}
              </th>
              <th
                scope="col"
                className="micro-label text-muted py-2 text-start font-medium"
                data-testid="conflict-latest-header"
              >
                {latestHeader}
              </th>
            </tr>
          </thead>
          <tbody>
            {fields.map((field) => {
              const changed = isChanged(field);
              return (
                <tr
                  key={field.id}
                  data-changed={changed || undefined}
                  className={cx(
                    "border-border-soft border-t",
                    changed && "bg-sync-conflict-soft/50",
                  )}
                >
                  <th scope="row" className="text-muted py-2 pe-2 text-start font-medium">
                    {field.label}
                  </th>
                  <td className="text-ink py-2 pe-2">{field.yours}</td>
                  <td className="text-ink py-2">{field.latest}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {canReapply || reapplyBlockedReason === undefined ? null : (
          <p className="text-muted m-0 text-[13px]" data-testid="conflict-reapply-blocked">
            {reapplyBlockedReason}
          </p>
        )}
        <div className="flex justify-start">
          <Button
            variant="secondary"
            size="sm"
            loading={busy === "keep_latest"}
            disabled={busy !== null}
            data-testid="conflict-keep-latest"
            onClick={() => void onKeepLatest()}
          >
            {t("clinical:tasks.conflict.keepLatest")}
          </Button>
        </div>
      </div>
    </ConfirmDialog>
  );
}
