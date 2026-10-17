/**
 * Typed error mapping (CLN-02, FRD §6 error codes): every repository failure the clinical UI
 * shows goes through `toClinicalError(e)`. The UI copy lives at `clinical:errors.<code>.*` and
 * never shows internal message / stack text.
 *
 * Decision: `INTERNAL` (500, incl. the simulated "Server 500" fault) and anything that is not a
 * `RepositoryError` (programming / storage failures) map to `DEPENDENCY_UNAVAILABLE` — to a
 * clinical user both mean "the service could not complete this, try again"; `sourceCode` and
 * `status` keep the original for the "Error code" line and diagnostics.
 */
import type {
  ConflictDetails,
  ErrorCode,
  ErrorReason,
  ParsedValidationMessage,
} from "@laif/contracts";
import type { DomainInvariantCode } from "@laif/domain";
import { isRepositoryError } from "@laif/repositories";

export const CLINICAL_ERROR_CODES = [
  "VALIDATION_ERROR",
  "FORBIDDEN",
  "NOT_FOUND",
  "CONFLICT",
  "DEPENDENCY_UNAVAILABLE",
  "OFFLINE",
  "TIMEOUT",
] as const;
export type ClinicalErrorCode = (typeof CLINICAL_ERROR_CODES)[number];

export type ClinicalError = {
  code: ClinicalErrorCode;
  /** The repository code before mapping (`INTERNAL` for a 500); `INTERNAL` for unknown errors. */
  sourceCode: ErrorCode;
  /** HTTP-equivalent status (0 = offline). */
  status: number;
  /** A retry with the SAME idempotency key is safe and useful. */
  retryable: boolean;
  /** `validation:*` keys per field (VALIDATION_ERROR). */
  fieldErrors?: Record<string, ParsedValidationMessage>;
  /** The current server copy of the entity (CONFLICT). */
  latest?: unknown;
  conflict?: ConflictDetails<unknown>;
  reason?: ErrorReason;
  invariantCode?: DomainInvariantCode;
  /** True when the failure was produced by Settings › Fault simulation. */
  simulated: boolean;
};

const RETRYABLE: ReadonlySet<ClinicalErrorCode> = new Set([
  "DEPENDENCY_UNAVAILABLE",
  "OFFLINE",
  "TIMEOUT",
]);

export function isClinicalError(value: unknown): value is ClinicalError {
  return (
    typeof value === "object" &&
    value !== null &&
    "code" in value &&
    "sourceCode" in value &&
    (CLINICAL_ERROR_CODES as readonly unknown[]).includes((value as { code: unknown }).code)
  );
}

export function toClinicalError(error: unknown): ClinicalError {
  if (isClinicalError(error)) return error;
  if (!isRepositoryError(error)) {
    return {
      code: "DEPENDENCY_UNAVAILABLE",
      sourceCode: "INTERNAL",
      status: 500,
      retryable: true,
      simulated: false,
    };
  }
  const code: ClinicalErrorCode = error.code === "INTERNAL" ? "DEPENDENCY_UNAVAILABLE" : error.code;
  const mapped: ClinicalError = {
    code,
    sourceCode: error.code,
    status: error.status,
    retryable: RETRYABLE.has(code),
    simulated: error.details["simulated"] === true,
  };
  if (error.fieldErrors !== undefined) mapped.fieldErrors = error.fieldErrors;
  if (error.conflict !== undefined) {
    mapped.conflict = error.conflict;
    mapped.latest = error.conflict.latest;
  }
  if (error.reason !== undefined) mapped.reason = error.reason;
  if (error.invariantCode !== undefined) mapped.invariantCode = error.invariantCode;
  return mapped;
}

/** i18n keys of an error's copy (`clinical:errors.<code>.title|body|action`). */
export function clinicalErrorKeys(code: ClinicalErrorCode) {
  return {
    title: `clinical:errors.${code}.title`,
    body: `clinical:errors.${code}.body`,
    action: `clinical:errors.${code}.action`,
  } as const;
}

/** Read retry policy: once, and never for FORBIDDEN / NOT_FOUND / VALIDATION_ERROR / CONFLICT. */
export function shouldRetryRead(failureCount: number, error: unknown): boolean {
  if (failureCount >= 1) return false;
  return toClinicalError(error).retryable;
}
