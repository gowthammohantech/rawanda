import type { ConflictResolution } from "@laif/domain";
import { domainKey, formatDateTime, useLanguage } from "@laif/i18n";
import type { ReactNode } from "react";

import { cx } from "../cx.ts";
import { useTx } from "../i18n.ts";
import { Icon } from "../icons/Icon.tsx";
import { Button } from "./Button.tsx";
import { StatusChip } from "./StatusChip.tsx";

export type ConflictRow = {
  id: string;
  /** Translated field label. */
  label: ReactNode;
  yours: ReactNode;
  latest: ReactNode;
  /** Defaults to `yours !== latest` for primitives; highlights the row. */
  changed?: boolean;
};

export type ConflictNoticeProps = {
  /** Field-by-field comparison of "your version" vs "latest". */
  rows: readonly ConflictRow[];
  /** `ConflictDetails.changedBy` already resolved to a display name. */
  changedBy?: string;
  /** `ConflictDetails.changedAt` (UTC ISO) — shown in Kigali time. */
  changedAt?: string;
  title?: ReactNode;
  description?: ReactNode;
  onResolve: (resolution: ConflictResolution) => unknown;
  /** The resolution currently being applied (shows busy, disables both). */
  resolving?: ConflictResolution | null;
  /** Restrict the offered actions (both by default). */
  resolutions?: readonly ConflictResolution[];
  className?: string;
};

const DEFAULT_RESOLUTIONS: readonly ConflictResolution[] = ["reapply_on_latest", "keep_latest"];

/**
 * The single web conflict UI (CLN ConflictPanel/ConflictResolutionDialog and ADM
 * ConflictDialog compose it inside a Drawer/ConfirmDialog): "Your version" vs "Latest
 * version", who changed it and when, and `reapply_on_latest` / `keep_latest`.
 */
export function ConflictNotice({
  rows,
  changedBy,
  changedAt,
  title,
  description,
  onResolve,
  resolving = null,
  resolutions = DEFAULT_RESOLUTIONS,
  className,
}: ConflictNoticeProps) {
  const t = useTx();
  const { language } = useLanguage();
  const time = changedAt === undefined ? undefined : formatDateTime(changedAt, language);
  const isChanged = (row: ConflictRow) =>
    row.changed ??
    ((typeof row.yours === "string" || typeof row.yours === "number") && row.yours !== row.latest);

  return (
    <section
      aria-label={typeof title === "string" ? title : t("common:conflict.title")}
      className={cx("border-sync-conflict/30 bg-surface rounded-lg border p-4", className)}
    >
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="flex min-w-0 items-start gap-3">
          <span className="bg-sync-conflict-soft text-sync-conflict inline-flex size-8 shrink-0 items-center justify-center rounded-sm">
            <Icon name="alert" size={18} />
          </span>
          <div className="min-w-0">
            <p className="text-ink font-semibold">{title ?? t("common:conflict.title")}</p>
            <p className="text-muted text-[13px]">
              {description ?? t("common:conflict.description")}
            </p>
          </div>
        </div>
        <StatusChip tone="danger">{t("domain:status.syncOp.conflict")}</StatusChip>
      </div>

      {changedBy === undefined && time === undefined ? null : (
        <p className="text-muted mt-3 text-xs">
          {[
            changedBy === undefined ? null : t("common:conflict.changedBy", { name: changedBy }),
            time === undefined ? null : t("common:conflict.changedAt", { time }),
          ]
            .filter((part): part is string => part !== null)
            .join(" · ")}
        </p>
      )}

      <table className="mt-3 w-full border-collapse text-[13px]">
        <thead>
          <tr className="text-start">
            <th scope="col" className="micro-label text-muted w-1/4 py-2 text-start font-medium">
              {t("common:conflict.field")}
            </th>
            <th scope="col" className="micro-label text-muted py-2 text-start font-medium">
              {t("common:conflict.yourVersion")}
            </th>
            <th scope="col" className="micro-label text-muted py-2 text-start font-medium">
              {t("common:conflict.latestVersion")}
            </th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => {
            const changed = isChanged(row);
            return (
              <tr
                key={row.id}
                data-changed={changed || undefined}
                className={cx("border-border-soft border-t", changed && "bg-sync-conflict-soft/50")}
              >
                <th scope="row" className="text-muted py-2 pe-2 text-start font-medium">
                  {row.label}
                </th>
                <td className="text-ink py-2 pe-2">{row.yours}</td>
                <td className="text-ink py-2">{row.latest}</td>
              </tr>
            );
          })}
        </tbody>
      </table>

      <div className="mt-4 flex flex-wrap gap-2">
        {resolutions.map((resolution) => (
          <Button
            key={resolution}
            variant={resolution === "keep_latest" ? "secondary" : "primary"}
            size="sm"
            loading={resolving === resolution}
            disabled={resolving !== null && resolving !== resolution}
            onClick={() => onResolve(resolution)}
          >
            {t(domainKey("conflictResolution", resolution))}
          </Button>
        ))}
      </div>
    </section>
  );
}
