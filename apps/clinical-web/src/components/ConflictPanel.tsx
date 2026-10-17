/**
 * Shared clinical conflict panel (CLN-06 task 9; reused by CLN-07..09): a thin wrapper around the
 * FND-09 `ConflictNotice` fed by `RepositoryError.conflict` (`latest`, `changedBy`, `changedAt`).
 * "Your version" vs "Latest version" rows, the `CONFLICT` pill and two actions only:
 * reload latest (`keep_latest`) and Cancel. Nothing is re-applied automatically — the stale write
 * is never silently overwritten.
 */
import type { ConflictDetails } from "@laif/contracts";
import { Button, ConflictNotice, useTx, type ConflictRow } from "@laif/ui-web";
import type { ReactNode } from "react";

import { personaName } from "../features/timeline/people.ts";

export type ConflictPanelProps = {
  conflict: ConflictDetails<unknown>;
  /** Field-by-field comparison (translated labels). */
  rows: readonly ConflictRow[];
  title?: ReactNode;
  description?: ReactNode;
  /** Reload the latest version (the `keep_latest` resolution). */
  onReload: () => unknown;
  onCancel: () => unknown;
  reloading?: boolean;
  /** Label of the second action (default "Cancel"; CLN-07: "Discard my draft"). */
  cancelLabel?: ReactNode;
  className?: string;
};

export function ConflictPanel({
  conflict,
  rows,
  title,
  description,
  onReload,
  onCancel,
  reloading = false,
  cancelLabel,
  className,
}: ConflictPanelProps) {
  const t = useTx();
  const changedBy = personaName(conflict.changedBy);
  return (
    <div role="alert" data-testid="conflict-panel" className={className}>
      <ConflictNotice
        rows={rows}
        {...(changedBy === null ? {} : { changedBy })}
        {...(conflict.changedAt === undefined ? {} : { changedAt: conflict.changedAt })}
        {...(title === undefined ? {} : { title })}
        {...(description === undefined ? {} : { description })}
        resolutions={["keep_latest"]}
        resolving={reloading ? "keep_latest" : null}
        onResolve={() => onReload()}
      />
      <div className="mt-2 flex justify-end">
        <Button variant="ghost" size="sm" disabled={reloading} onClick={() => onCancel()}>
          {cancelLabel ?? t("clinical:review.conflict.cancel")}
        </Button>
      </div>
    </div>
  );
}
