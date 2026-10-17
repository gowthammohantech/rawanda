/**
 * `useDecisionDraft(reviewId)` (CLN-07 task 4, T-09): the unsaved decision of one review kept in
 * sessionStorage (this browser tab only, synthetic data) as
 * `{ values, idempotencyKey, expectedVersion, submitted }`.
 *
 * - `idempotencyKey` is the form-session key: created once and reused by every submit / retry of
 *   this draft, so a reload mid-submit can only REPLAY the original write, never add a second one.
 * - `submitted` holds the exact variables sent on Confirm (written BEFORE the call). After a
 *   reload, when the review is already decided, the page re-sends them with the same key: the
 *   repository answers with the stored result (`replayed: true`) → success state, no new write.
 * - `saveValues` autosaves (debounced 500 ms); `clear()` runs on success or explicit discard.
 * - Storage failures (private mode, quota) are swallowed: drafts are a convenience.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { EMPTY_DECISION_VALUES, type DecisionFormValues, type DecisionVariables } from "./form.ts";

export const DRAFT_AUTOSAVE_MS = 500;
const PREFIX = "laif-clinical:decision-draft:";

export type DecisionDraft = {
  values: DecisionFormValues;
  idempotencyKey: string;
  expectedVersion: number;
  /** Variables sent on Confirm (null until the first submit). */
  submitted: DecisionVariables | null;
};

export const draftStorageKey = (reviewId: string) => `${PREFIX}${reviewId}`;

function storage(): Storage | null {
  try {
    return typeof window === "undefined" ? null : window.sessionStorage;
  } catch {
    return null;
  }
}

function isDraft(value: unknown): value is DecisionDraft {
  const draft = value as Partial<DecisionDraft> | null;
  return (
    typeof draft === "object" &&
    draft !== null &&
    typeof draft.idempotencyKey === "string" &&
    typeof draft.expectedVersion === "number" &&
    typeof draft.values === "object" &&
    draft.values !== null
  );
}

export function readDecisionDraft(reviewId: string): DecisionDraft | null {
  try {
    const raw = storage()?.getItem(draftStorageKey(reviewId));
    if (raw === null || raw === undefined) return null;
    const parsed: unknown = JSON.parse(raw);
    if (!isDraft(parsed)) return null;
    return {
      ...parsed,
      values: { ...EMPTY_DECISION_VALUES, ...parsed.values },
      submitted: parsed.submitted ?? null,
    };
  } catch {
    return null;
  }
}

export function writeDecisionDraft(reviewId: string, draft: DecisionDraft): void {
  try {
    storage()?.setItem(draftStorageKey(reviewId), JSON.stringify(draft));
  } catch {
    // ignore: the draft is a convenience only
  }
}

export function clearDecisionDraft(reviewId: string): void {
  try {
    storage()?.removeItem(draftStorageKey(reviewId));
  } catch {
    // ignore
  }
}

const newKey = (): string => crypto.randomUUID();

export function useDecisionDraft(reviewId: string, currentVersion: number) {
  /** The draft found at mount (restore prompt / replay check). */
  const [initial] = useState(() => readDecisionDraft(reviewId));
  const [idempotencyKey] = useState(() => initial?.idempotencyKey ?? newKey());
  const meta = useRef({
    expectedVersion: initial?.expectedVersion ?? currentVersion,
    submitted: initial?.submitted ?? null,
  });
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pendingValues = useRef<DecisionFormValues | null>(null);

  const write = useCallback(
    (values: DecisionFormValues) =>
      writeDecisionDraft(reviewId, {
        values,
        idempotencyKey,
        expectedVersion: meta.current.expectedVersion,
        submitted: meta.current.submitted,
      }),
    [reviewId, idempotencyKey],
  );

  const cancelPending = useCallback(() => {
    if (timer.current !== null) clearTimeout(timer.current);
    timer.current = null;
    pendingValues.current = null;
  }, []);

  /** Debounced autosave (500 ms). */
  const saveValues = useCallback(
    (values: DecisionFormValues) => {
      cancelPending();
      pendingValues.current = values;
      timer.current = setTimeout(() => {
        timer.current = null;
        pendingValues.current = null;
        write(values);
      }, DRAFT_AUTOSAVE_MS);
    },
    [cancelPending, write],
  );

  /** Immediately before Confirm sends the call: keep the exact variables with the key. */
  const markSubmitted = useCallback(
    (values: DecisionFormValues, variables: DecisionVariables) => {
      cancelPending();
      meta.current = { expectedVersion: variables.expectedVersion, submitted: variables };
      write(values);
    },
    [cancelPending, write],
  );

  /** After "reload latest" on a conflict: the next submit is checked against this version. */
  const setExpectedVersion = useCallback((version: number) => {
    meta.current = { expectedVersion: version, submitted: null };
  }, []);

  const clear = useCallback(() => {
    cancelPending();
    meta.current = { expectedVersion: meta.current.expectedVersion, submitted: null };
    clearDecisionDraft(reviewId);
  }, [cancelPending, reviewId]);

  // Flush a pending autosave on unmount (navigation away keeps the draft).
  useEffect(
    () => () => {
      if (pendingValues.current !== null) write(pendingValues.current);
      if (timer.current !== null) clearTimeout(timer.current);
    },
    [write],
  );

  return useMemo(
    () => ({
      initial,
      idempotencyKey,
      expectedVersion: () => meta.current.expectedVersion,
      saveValues,
      markSubmitted,
      setExpectedVersion,
      clear,
    }),
    [initial, idempotencyKey, saveValues, markSubmitted, setExpectedVersion, clear],
  );
}
