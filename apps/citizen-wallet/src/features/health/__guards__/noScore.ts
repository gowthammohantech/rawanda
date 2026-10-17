/**
 * Forbidden-copy guard (CTZ-03 task 10; tech spec §2.4 exclusion, §11 deferred wellness
 * scoring). Test-only helper: the wallet never shows a score, a risk forecast, a diagnosis claim
 * or a percentage. `findForbiddenCopy` scans rendered text; `forbiddenCopyKeys` scans a
 * catalogue (keys AND values) so a forbidden string cannot even be added to `citizen:health`.
 */
import type { Language } from "@laif/i18n";

export const FORBIDDEN_COPY: Record<Language, RegExp> = {
  en: /score|risk of|forecast|diagnos(is|ed) with|you have (hypertension|diabetes)|%/iu,
  // RW equivalents (draft — linguistic review): amanota (score), ibyago byo (risk of),
  // iteganyagihe / guteganya (forecast), basanze ufite / urwaye (diagnosed with / you have),
  // umuvuduko ukabije (hypertension), diyabete.
  rw: /amanota|ibyago byo|iteganya|guteganya|basanze ufite|urwaye|umuvuduko ukabije|diyabete|%/iu,
};

/** Words that would turn a value into a judgement (Understand sheet: no thresholds). */
export const JUDGEMENT_WORDS: Record<Language, RegExp> = {
  en: /\b(high|low|normal|abnormal|elevated|dangerous)\b/iu,
  rw: /\b(hejuru cyane|hasi cyane|bisanzwe|bidasanzwe|biteye akaga)\b/iu,
};

export type ForbiddenMatch = { language: Language; match: string; context: string };

export function findForbiddenCopy(text: string, language: Language): ForbiddenMatch[] {
  const out: ForbiddenMatch[] = [];
  const pattern = new RegExp(FORBIDDEN_COPY[language].source, "giu");
  for (const m of text.matchAll(pattern)) {
    const at = m.index ?? 0;
    out.push({ language, match: m[0], context: text.slice(Math.max(0, at - 30), at + 30) });
  }
  return out;
}

function flatten(value: unknown, prefix: string, out: [string, string][]): void {
  if (typeof value === "string") {
    out.push([prefix, value]);
    return;
  }
  if (value !== null && typeof value === "object") {
    for (const [k, v] of Object.entries(value))
      flatten(v, prefix === "" ? k : `${prefix}.${k}`, out);
  }
}

/** Catalogue keys whose key name or value matches the forbidden copy of `language`. */
export function forbiddenCopyKeys(catalogue: unknown, language: Language): string[] {
  const entries: [string, string][] = [];
  flatten(catalogue, "", entries);
  const pattern = FORBIDDEN_COPY[language];
  return entries.filter(([k, v]) => pattern.test(k) || pattern.test(v)).map(([k]) => k);
}
