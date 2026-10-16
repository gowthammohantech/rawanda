/**
 * Dev-only missing-key logging. A key is "missing" when the requested language had no value
 * and the EN fallback (or, if EN lacks it too, the raw key) was used. Each `(lng, ns, key)` is
 * warned once and recorded in `getMissingKeyReport()`. Production builds stay silent.
 */

export type MissingKeyKind =
  /** Not in the requested language; the English fallback was rendered. */
  | "fallback"
  /** Not in any language (should be impossible with typed keys). */
  | "missing"
  /** A validation message string that `parseValidationMessage` did not recognise. */
  | "unknownValidationMessage";

export type MissingKeyEntry = {
  lng: string;
  ns: string;
  key: string;
  kind: MissingKeyKind;
};

export type MissingKeyWarn = (...args: unknown[]) => void;

const entries = new Map<string, MissingKeyEntry>();
let devLogging = false;
let warnSink: MissingKeyWarn = (...args) => console.warn(...args);

/** Turned on by `createI18n({ isDev: true })`; validation helpers log only when on. */
export function setMissingKeyLogging(enabled: boolean, warn?: MissingKeyWarn): void {
  devLogging = enabled;
  if (warn !== undefined) warnSink = warn;
}

export function isMissingKeyLoggingEnabled(): boolean {
  return devLogging;
}

/** Records one entry; warns (`[i18n] missing <lng> <ns> <key>`) only the first time. */
export function recordMissingKey(entry: MissingKeyEntry, warn: MissingKeyWarn = warnSink): boolean {
  const id = `${entry.lng}|${entry.ns}|${entry.key}`;
  if (entries.has(id)) return false;
  entries.set(id, entry);
  warn("[i18n] missing", entry.lng, entry.ns, entry.key);
  return true;
}

/** Everything recorded since start-up (or the last `clearMissingKeyReport`). */
export function getMissingKeyReport(): MissingKeyEntry[] {
  return [...entries.values()];
}

export function clearMissingKeyReport(): void {
  entries.clear();
}
