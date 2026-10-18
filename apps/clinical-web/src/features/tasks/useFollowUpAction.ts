/**
 * One follow-up write of a task dialog (CLN-09 task 4), on `useUpdateFollowUp`
 * (`useIdempotentMutation`): one key per dialog session, re-entry blocked (double click = one
 * write), same-key retry after TIMEOUT / OFFLINE / DEPENDENCY_UNAVAILABLE.
 *
 * On `CONFLICT` (stale `expectedVersion`, e.g. after "Simulate worker updating follow-up") the
 * rejected variables, the conflict details and the ORIGINAL idempotency key are kept so the
 * dialog can show `ConflictResolutionDialog`:
 * - `keepLatest()` → discard the local change, refetch, audit `conflict.resolved`
 *   (`keep_latest`, original key);
 * - `reapply()` → a NEW key, re-submit the same change with the latest version, then audit
 *   `conflict.resolved` (`reapply_on_latest`, original + new key). A second conflict replaces
 *   the first (another change happened meanwhile).
 */
import type { ConflictDetails, WriteResult } from "@laif/contracts";
import type { ConflictResolution, FollowUp } from "@laif/domain";
import type { FollowUpUpdateCall } from "@laif/repositories";
import { useQueryClient } from "@tanstack/react-query";
import { createContext, useContext, useRef, useState } from "react";

import { useSession } from "../../session/useSession.ts";
import { useRecordConflictResolution, useUpdateFollowUp } from "./hooks.ts";

/**
 * The drawer pins the copy the user is working on (WF-02: a background refetch never swaps the
 * version under an open form). Writes re-pin: a save pins the saved copy, `Keep latest` pins
 * the latest one.
 */
export const TaskRebaseContext = createContext<(followUp: FollowUp) => void>(() => undefined);

export type PendingConflict = {
  variables: FollowUpUpdateCall;
  conflict: ConflictDetails<unknown>;
  latest: FollowUp;
  /** Key of the write rejected with CONFLICT. */
  originalKey: string;
  /** Key of the re-apply write (rotated once per conflict; a retry after a timeout reuses it). */
  reapplyKey: string | null;
};

export function useFollowUpAction(onSaved?: (next: FollowUp) => void) {
  const queryClient = useQueryClient();
  const fac = useSession().activeFacilityId ?? "none";
  const recordResolution = useRecordConflictResolution();
  const [pending, setPending] = useState<PendingConflict | null>(null);
  const [busy, setBusy] = useState<ConflictResolution | null>(null);
  const keyInFlight = useRef<string>("");
  const rebase = useContext(TaskRebaseContext);

  const mutation = useUpdateFollowUp({
    onError: (error, variables) => {
      if (error.code !== "CONFLICT" || error.conflict === undefined) return;
      const latest = (error.latest ?? null) as FollowUp | null;
      if (latest === null) return;
      const conflict = error.conflict;
      setPending((current) => ({
        variables,
        conflict,
        latest,
        originalKey: current?.originalKey ?? keyInFlight.current,
        reapplyKey: null,
      }));
    },
  });

  const submit = async (variables: FollowUpUpdateCall) => {
    keyInFlight.current = mutation.idempotencyKey;
    const result = await mutation.submit(variables);
    if (result !== undefined) {
      rebase(result.data);
      onSaved?.(result.data);
    }
    return result;
  };

  const refresh = () =>
    Promise.all(
      ["followUp", "followUps", "followUpCounts", "audit"].map((segment) =>
        queryClient.invalidateQueries({ queryKey: ["clinical", fac, segment] }),
      ),
    );

  const keepLatest = async () => {
    if (pending === null) return;
    setBusy("keep_latest");
    try {
      await recordResolution({
        resolution: "keep_latest",
        followUp: pending.latest,
        originalKey: pending.originalKey,
        expectedVersion: pending.conflict.expectedVersion,
        latestVersion: pending.latest.version,
      });
      await refresh();
      rebase(pending.latest);
      mutation.reset();
      setPending(null);
    } finally {
      setBusy(null);
    }
  };

  const reapply = async (): Promise<WriteResult<FollowUp> | undefined> => {
    if (pending === null) return undefined;
    setBusy("reapply_on_latest");
    try {
      const newKey = pending.reapplyKey ?? mutation.rotateKey();
      if (pending.reapplyKey === null) setPending({ ...pending, reapplyKey: newKey });
      const variables = {
        ...pending.variables,
        expectedVersion: pending.latest.version,
      };
      keyInFlight.current = newKey;
      const result = await mutation.submit(variables);
      if (result === undefined) return undefined;
      await recordResolution({
        resolution: "reapply_on_latest",
        followUp: pending.latest,
        originalKey: pending.originalKey,
        newKey,
        expectedVersion: pending.conflict.expectedVersion,
        latestVersion: pending.latest.version,
      });
      setPending(null);
      rebase(result.data);
      onSaved?.(result.data);
      return result;
    } finally {
      setBusy(null);
    }
  };

  /** Same-key retry after TIMEOUT / OFFLINE / DEPENDENCY_UNAVAILABLE. */
  const retry = async () => {
    const result = await mutation.retry();
    if (result !== undefined) {
      rebase(result.data);
      onSaved?.(result.data);
    }
    return result;
  };

  const cancelConflict = () => {
    setPending(null);
    mutation.reset();
  };

  return { mutation, submit, retry, pending, busy, keepLatest, reapply, cancelConflict };
}
