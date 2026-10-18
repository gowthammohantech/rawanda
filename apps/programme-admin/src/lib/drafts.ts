/**
 * Dialog drafts (ADM-09 task 5, FRD T-09 "interrupted session"): an open dialog with unsaved
 * input (programme action, triage, export reason, grant edit) keeps a draft in `sessionStorage`,
 * keyed by its idempotency key. When the demo session expires and the user signs in again on the
 * same URL, the page finds the draft for its context, reopens the dialog with the input and the
 * SAME idempotency key — so a submit that already reached the repository is replayed, never
 * duplicated. Drafts hold form input only (no patient data); they are dropped on success, on
 * Cancel and on Reset demo. Tab-scoped (sessionStorage), never in the repository.
 */
import { useEffect } from "react";

export const DRAFTS_STORAGE_KEY = "laif.admin.drafts" as const;
/**
 * Drafts are offered back only right after a re-login from an expired session ("armed" by the
 * sign-in page, disarmed by the next navigation); any other sign-in drops them.
 */
export const DRAFTS_RESTORE_KEY = "laif.admin.drafts.restore" as const;

export type DialogDraftKind = "programmeAction" | "triage" | "exportReason" | "grant";

export type DialogDraft<V = Record<string, unknown>> = {
  kind: DialogDraftKind;
  /** Where the dialog was open: path + search (+ a dialog-specific suffix, e.g. a facility). */
  context: string;
  /** Idempotency key of the dialog opening (reused on restore). */
  key: string;
  /** Dialog-specific subject (e.g. the facility of a programme action). */
  subject: string;
  values: V;
};

type DraftMap = Record<string, DialogDraft>;

function storage(): Storage | null {
  try {
    return typeof window === "undefined" ? null : window.sessionStorage;
  } catch {
    return null;
  }
}

function readAll(): DraftMap {
  const raw = storage()?.getItem(DRAFTS_STORAGE_KEY);
  if (raw === null || raw === undefined) return {};
  try {
    const parsed = JSON.parse(raw) as unknown;
    return parsed !== null && typeof parsed === "object" ? (parsed as DraftMap) : {};
  } catch {
    return {};
  }
}

function writeAll(drafts: DraftMap): void {
  try {
    const s = storage();
    if (s === null) return;
    if (Object.keys(drafts).length === 0) s.removeItem(DRAFTS_STORAGE_KEY);
    else s.setItem(DRAFTS_STORAGE_KEY, JSON.stringify(drafts));
  } catch {
    // Storage blocked: drafts are a convenience only.
  }
}

const sameSlot = (a: DialogDraft, b: Pick<DialogDraft, "kind" | "context" | "subject">) =>
  a.kind === b.kind && a.context === b.context && a.subject === b.subject;

/** Saves a draft; an older draft of the same dialog (kind, context, subject) is replaced. */
export function saveDraft<V>(draft: DialogDraft<V>): void {
  const kept = Object.fromEntries(
    Object.entries(readAll()).filter(([, d]) => !sameSlot(d, draft as DialogDraft)),
  );
  writeAll({ ...kept, [draft.key]: draft as DialogDraft });
}

/** Drops the draft of one dialog (kind, context, subject). */
export function clearDraftSlot(slot: Pick<DialogDraft, "kind" | "context" | "subject">): void {
  const all = readAll();
  const kept = Object.fromEntries(Object.entries(all).filter(([, d]) => !sameSlot(d, slot)));
  if (Object.keys(kept).length !== Object.keys(all).length) writeAll(kept);
}

export function armDraftRestore(): void {
  try {
    storage()?.setItem(DRAFTS_RESTORE_KEY, "1");
  } catch {
    // Storage blocked: nothing to restore.
  }
}

export function disarmDraftRestore(): void {
  try {
    storage()?.removeItem(DRAFTS_RESTORE_KEY);
  } catch {
    // Storage blocked.
  }
}

function restoreArmed(): boolean {
  try {
    return storage()?.getItem(DRAFTS_RESTORE_KEY) === "1";
  } catch {
    return false;
  }
}

/** The newest draft of `kind` saved in `context` — only right after a re-login (else null). */
export function findDraft<V = Record<string, unknown>>(
  kind: DialogDraftKind,
  context: string,
): DialogDraft<V> | null {
  if (!restoreArmed()) return null;
  const match = Object.values(readAll()).filter((d) => d.kind === kind && d.context === context);
  return (match.at(-1) as DialogDraft<V> | undefined) ?? null;
}

export function clearDraft(key: string): void {
  const all = readAll();
  if (!(key in all)) return;
  delete all[key];
  writeAll(all);
}

/** Drops every draft of `kind` saved in `context` (a form that changed its key). */
export function clearDraftsOf(kind: DialogDraftKind, context: string): void {
  const all = readAll();
  const kept = Object.fromEntries(
    Object.entries(all).filter(([, d]) => !(d.kind === kind && d.context === context)),
  );
  if (Object.keys(kept).length !== Object.keys(all).length) writeAll(kept);
}

export function clearAllDrafts(): void {
  writeAll({});
  disarmDraftRestore();
}

/**
 * Keeps the draft of an open dialog up to date. `subscribe` is react-hook-form's (stable)
 * `watch` in its callback form; nothing is stored until the user changes something.
 */
export type DraftSubscribe<V> = (listener: (values: V) => void) => { unsubscribe: () => void };

export function useDialogDraft<V>(options: {
  kind: DialogDraftKind;
  /** null = drafts disabled for this opening (no restore context). */
  context: string | null;
  key: string;
  subject: string;
  subscribe: DraftSubscribe<V>;
}): { clear: () => void } {
  const { kind, context, key, subject, subscribe } = options;
  useEffect(() => {
    if (context === null) return;
    const subscription = subscribe((values) => saveDraft({ kind, context, key, subject, values }));
    return () => subscription.unsubscribe();
  }, [kind, context, key, subject, subscribe]);
  return {
    clear: () => {
      clearDraft(key);
      if (context !== null) clearDraftSlot({ kind, context, subject });
    },
  };
}
