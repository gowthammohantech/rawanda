/**
 * `useIdempotentMutation` (CLN-02 task 4, FRD §6 idempotency / `If-Match`). Wraps TanStack
 * `useMutation` for every clinical write:
 * - ONE idempotency key per form session: `crypto.randomUUID()` at mount, rotated only after a
 *   success (a re-submit after an ambiguous failure reuses it, so the repository replays instead
 *   of writing twice);
 * - `expectedVersion` travels inside the variables (the repository answers a stale one with
 *   `CONFLICT`); the mutation itself never retries automatically;
 * - `CONFLICT` → `error.latest` holds the current copy, `canRetry` is false (reload / review the
 *   newer version first); `TIMEOUT` / `OFFLINE` / `DEPENDENCY_UNAVAILABLE` → `retry()` re-sends
 *   the last variables with the SAME key (manual retry button);
 * - re-entry is blocked while pending (a double click sends one call), `isSubmitting` disables
 *   the submit button.
 */
import type { WriteResult } from "@laif/contracts";
import { useMutation, useQueryClient, type QueryKey } from "@tanstack/react-query";
import { useCallback, useMemo, useRef, useState } from "react";

import { toClinicalError, type ClinicalError } from "./errors.ts";

export type UseIdempotentMutationOptions<TVariables, TData> = {
  mutationFn: (variables: TVariables, idempotencyKey: string) => Promise<WriteResult<TData>>;
  /** Query-key prefixes invalidated after a success (e.g. `clinicalInvalidations(fac, name)`). */
  invalidate?:
    | readonly QueryKey[]
    | ((result: WriteResult<TData>, variables: TVariables) => readonly QueryKey[]);
  onSuccess?: (result: WriteResult<TData>, variables: TVariables) => void;
  onError?: (error: ClinicalError, variables: TVariables) => void;
  /** Test seam (default `crypto.randomUUID()`). */
  newKey?: () => string;
  /**
   * The key of the FIRST submit (CLN-07: a decision draft restored from sessionStorage keeps its
   * form-session key, so a reload mid-submit replays instead of writing twice). Default `newKey()`.
   */
  initialKey?: string;
};

export type IdempotentMutation<TVariables, TData> = {
  /** Sends the write; resolves to the result, or `undefined` when it failed or was blocked. */
  submit: (variables: TVariables) => Promise<WriteResult<TData> | undefined>;
  /** Re-sends the last variables with the same key (only when `canRetry`). */
  retry: () => Promise<WriteResult<TData> | undefined>;
  isSubmitting: boolean;
  error: ClinicalError | null;
  /** The last failure can be retried with the same key (TIMEOUT / OFFLINE / DEPENDENCY_UNAVAILABLE). */
  canRetry: boolean;
  data: WriteResult<TData> | undefined;
  /** The key the next `submit` / `retry` uses. */
  idempotencyKey: string;
  /** Clears error / data (the key is kept). */
  reset: () => void;
};

const defaultKey = (): string => crypto.randomUUID();

export function useIdempotentMutation<TVariables, TData>(
  options: UseIdempotentMutationOptions<TVariables, TData>,
): IdempotentMutation<TVariables, TData> {
  const { mutationFn, invalidate, onSuccess, onError, newKey = defaultKey, initialKey } = options;
  const queryClient = useQueryClient();
  const [key, setKey] = useState(() => initialKey ?? newKey());
  const keyRef = useRef(key);
  const inFlight = useRef(false);
  const lastVariables = useRef<{ value: TVariables } | null>(null);

  const mutation = useMutation<WriteResult<TData>, Error, { variables: TVariables; key: string }>({
    mutationFn: ({ variables, key: idempotencyKey }) => mutationFn(variables, idempotencyKey),
    retry: false,
  });

  const run = useCallback(
    async (variables: TVariables): Promise<WriteResult<TData> | undefined> => {
      if (inFlight.current) return undefined;
      inFlight.current = true;
      lastVariables.current = { value: variables };
      try {
        const result = await mutation.mutateAsync({ variables, key: keyRef.current });
        const next = newKey();
        keyRef.current = next;
        setKey(next);
        const keys = typeof invalidate === "function" ? invalidate(result, variables) : invalidate;
        await Promise.all(
          (keys ?? []).map((queryKey) => queryClient.invalidateQueries({ queryKey })),
        );
        onSuccess?.(result, variables);
        return result;
      } catch (error) {
        onError?.(toClinicalError(error), variables);
        return undefined;
      } finally {
        inFlight.current = false;
      }
    },
    [mutation, newKey, invalidate, queryClient, onSuccess, onError],
  );

  const error = useMemo(
    () => (mutation.error === null ? null : toClinicalError(mutation.error)),
    [mutation.error],
  );
  const canRetry = error !== null && error.retryable && lastVariables.current !== null;

  const retry = useCallback(async () => {
    const last = lastVariables.current;
    if (last === null) return undefined;
    return run(last.value);
  }, [run]);

  return {
    submit: run,
    retry,
    isSubmitting: mutation.isPending,
    error,
    canRetry,
    data: mutation.data,
    idempotencyKey: key,
    reset: mutation.reset,
  };
}
