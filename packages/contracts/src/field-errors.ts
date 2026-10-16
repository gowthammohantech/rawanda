/**
 * Converts Zod issues into `{ fieldPath: ParsedValidationMessage }` for non-RHF callers
 * (native forms) and for repository `VALIDATION_ERROR.fieldErrors` (FND-03 task 6).
 */
import type { z } from "zod";

import { contractsErrorMap } from "./error-map.ts";
import { parseValidationMessage, type ParsedValidationMessage } from "./messages.ts";

/** Field path used for issues on the object itself (cross-field refinements without a path). */
export const ROOT_FIELD = "_root" as const;

const FALLBACK: ParsedValidationMessage = { key: "invalid", params: {} };

export function issuePath(path: readonly PropertyKey[]): string {
  return path.length === 0 ? ROOT_FIELD : path.map(String).join(".");
}

/** First issue per field path wins (matches how forms show one message per field). */
export function issuesToFieldErrors(
  issues: readonly z.core.$ZodIssue[],
): Record<string, ParsedValidationMessage> {
  const out: Record<string, ParsedValidationMessage> = {};
  for (const issue of issues) {
    const path = issuePath(issue.path);
    if (path in out) continue;
    out[path] = parseValidationMessage(issue.message) ?? FALLBACK;
  }
  return out;
}

/**
 * Parses `data` with `schema` and returns field errors (empty object = valid). Uses the
 * contracts error map per parse, so it works even before `installContractsErrorMap()`.
 */
export function safeParseToFieldErrors(
  schema: z.ZodType,
  data: unknown,
): Record<string, ParsedValidationMessage> {
  const result = schema.safeParse(data, { error: contractsErrorMap });
  return result.success ? {} : issuesToFieldErrors(result.error.issues);
}
