/**
 * Draft autosave (HWM-05 task 5): every change is saved on the device 600 ms after typing stops
 * (no validation needed to save), and IMMEDIATELY when the app goes to the background /
 * inactive (`AppState`), when a field loses focus (`flush` on blur), on back navigation and on
 * unmount. Saves are serialised (one write at a time, in order) and identical payloads are
 * skipped (`signature`), which keeps `screening.draft_saved` audit noise down.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { AppState } from "react-native";

export const DRAFT_AUTOSAVE_DEBOUNCE_MS = 600;

export type AutosaveStatus = "idle" | "saving" | "saved" | "error";

export type UseDraftAutosaveOptions<V> = {
  values: V;
  /** Writes the draft; resolves with the saved record's `updatedAt` (demo clock, UTC). */
  save: (values: V) => Promise<string>;
  /** Comparable payload of `values` (equal signature = nothing to save). */
  signature: (values: V) => string;
  /** `updatedAt` of the loaded draft ("Draft saved on this device · 10:42"). */
  initialSavedAt?: string | null;
  delayMs?: number;
};

export type DraftAutosave = {
  status: AutosaveStatus;
  savedAt: string | null;
  /** Saves pending changes now (resolves when written, or at once when nothing changed). */
  flush: () => Promise<void>;
};

export function useDraftAutosave<V>({
  values,
  save,
  signature,
  initialSavedAt = null,
  delayMs = DRAFT_AUTOSAVE_DEBOUNCE_MS,
}: UseDraftAutosaveOptions<V>): DraftAutosave {
  const [status, setStatus] = useState<AutosaveStatus>(initialSavedAt === null ? "idle" : "saved");
  const [savedAt, setSavedAt] = useState<string | null>(initialSavedAt);
  const sig = signature(values);
  const latest = useRef({ values, sig, save, signature });
  latest.current = { values, sig, save, signature };
  // The loaded draft is already saved: no write until something changes.
  const lastSaved = useRef(sig);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const chain = useRef<Promise<void>>(Promise.resolve());
  const mounted = useRef(true);

  const flush = useCallback((): Promise<void> => {
    if (timer.current !== null) {
      clearTimeout(timer.current);
      timer.current = null;
    }
    chain.current = chain.current.then(async () => {
      const current = latest.current;
      const nextSig = current.signature(current.values);
      if (nextSig === lastSaved.current) return;
      if (mounted.current) setStatus("saving");
      try {
        const at = await current.save(current.values);
        lastSaved.current = nextSig;
        if (mounted.current) {
          setSavedAt(at);
          setStatus("saved");
        }
      } catch {
        if (mounted.current) setStatus("error");
      }
    });
    return chain.current;
  }, []);

  // Debounced save on every change.
  useEffect(() => {
    if (sig === lastSaved.current) return;
    if (timer.current !== null) clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      timer.current = null;
      void flush();
    }, delayMs);
  }, [sig, delayMs, flush]);

  // Flush when the app leaves the foreground (app switcher, home button, kill).
  useEffect(() => {
    const subscription = AppState.addEventListener("change", (state) => {
      if (state !== "active") void flush();
    });
    return () => subscription.remove();
  }, [flush]);

  // Flush on unmount (back navigation without an explicit flush).
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      void flush();
    };
  }, [flush]);

  return { status, savedAt, flush };
}
