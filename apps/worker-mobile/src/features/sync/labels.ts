/** Shared HWM-09 label helpers (op label, error words, retry line). */
import type { TranslationKey, useTx } from "@laif/ui-native";

import { syncOpLabelKey } from "../../data/opLabel.ts";
import type { SyncErrorCode, SyncOpRow } from "../../data/syncCenter.ts";

type Translate = ReturnType<typeof useTx>;

export function opTitle(row: Pick<SyncOpRow, "label" | "resolution">, t: Translate): string {
  const label = t(syncOpLabelKey(row.label));
  return row.resolution ? t("worker:sync.op.resolution", { label }) : label;
}

export const errorWords = (code: SyncErrorCode, t: Translate): string =>
  t(`worker:sync.error.${code}` as TranslationKey);

/** Status line of a waiting op: "Retrying in 8s", "Retry now", "Sending now…", … */
export function waitingLine(row: SyncOpRow, t: Translate): string {
  switch (row.op.status) {
    case "sending":
      return t("worker:sync.sendingNow");
    case "blocked_revoked":
      return t("worker:sync.blocked");
    case "retryable_failure":
      if (row.retry.kind === "scheduled") {
        return t("worker:sync.retryIn", { seconds: row.retry.seconds });
      }
      return row.retry.kind === "manual" ? t("worker:sync.retryManual") : t("worker:sync.retryDue");
    default:
      return t("worker:sync.queued");
  }
}
