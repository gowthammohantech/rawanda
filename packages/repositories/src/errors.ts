/**
 * `RepositoryError` — the only error class any repository method throws (FND-03 / FND-07).
 *
 * Mapping decisions (documented, binding for app phases):
 * - Zod issues → `VALIDATION_ERROR` with `fieldErrors` (`validation:*` keys).
 * - `DomainInvariantError` → `VALIDATION_ERROR` with `invariantCode` (UI: `domain:invariant.<code>`),
 *   except `STALE_VERSION` → `CONFLICT`.
 * - `IllegalTransitionError` → `VALIDATION_ERROR` reason `INVALID_TRANSITION` (CLN-08).
 * - auth-demo `ForbiddenError` → `FORBIDDEN` with its reason.
 * - anything else → `INTERNAL` (message kept in `details.message`, never shown to users).
 */
import {
  HTTP_STATUS_BY_CODE,
  isRetryableErrorCode,
  type ConflictDetails,
  type ErrorCode,
  type ErrorReason,
  type ParsedValidationMessage,
  type RepositoryErrorShape,
} from "@laif/contracts";
import {
  DomainInvariantError,
  IllegalTransitionError,
  type DomainInvariantCode,
  type JsonValue,
} from "@laif/domain";
import { isForbiddenError } from "@laif/auth-demo";

export type RepositoryErrorOptions = {
  reason?: ErrorReason;
  fieldErrors?: Record<string, ParsedValidationMessage>;
  conflict?: ConflictDetails<unknown>;
  invariantCode?: DomainInvariantCode;
  details?: { [key: string]: JsonValue };
  message?: string;
};

export class RepositoryError extends Error implements RepositoryErrorShape {
  readonly code: ErrorCode;
  readonly status: number;
  readonly reason?: ErrorReason;
  readonly fieldErrors?: Record<string, ParsedValidationMessage>;
  readonly conflict?: ConflictDetails<unknown>;
  readonly invariantCode?: DomainInvariantCode;
  readonly details: { [key: string]: JsonValue };

  constructor(code: ErrorCode, options: RepositoryErrorOptions = {}) {
    super(
      options.message ??
        `${code}${options.reason ? ` (${options.reason})` : ""}${
          options.invariantCode ? ` [${options.invariantCode}]` : ""
        }`,
    );
    this.name = "RepositoryError";
    this.code = code;
    this.status = HTTP_STATUS_BY_CODE[code];
    if (options.reason !== undefined) this.reason = options.reason;
    if (options.fieldErrors !== undefined) this.fieldErrors = options.fieldErrors;
    if (options.conflict !== undefined) this.conflict = options.conflict;
    if (options.invariantCode !== undefined) this.invariantCode = options.invariantCode;
    this.details = options.details ?? {};
  }

  /** True for codes after which a retry with the SAME idempotency key is safe. */
  get retryable(): boolean {
    return isRetryableErrorCode(this.code);
  }

  /** Plain, serialisable shape (transport round-trips, sync `lastError`). */
  toShape(): RepositoryErrorShape {
    const shape: RepositoryErrorShape = { code: this.code, status: this.status };
    if (this.reason !== undefined) shape.reason = this.reason;
    if (this.fieldErrors !== undefined) shape.fieldErrors = this.fieldErrors;
    if (this.conflict !== undefined) shape.conflict = this.conflict;
    if (this.invariantCode !== undefined) shape.invariantCode = this.invariantCode;
    if (Object.keys(this.details).length > 0) shape.details = this.details;
    return shape;
  }
}

export function isRepositoryError(value: unknown): value is RepositoryError {
  return value instanceof RepositoryError;
}

/** Normalises anything thrown inside a repository call into a `RepositoryError`. */
export function toRepositoryError(error: unknown): RepositoryError {
  if (error instanceof RepositoryError) return error;
  if (error instanceof DomainInvariantError) {
    const details = JSON.parse(JSON.stringify(error.details)) as { [key: string]: JsonValue };
    if (error.code === "STALE_VERSION") {
      return new RepositoryError("CONFLICT", { invariantCode: error.code, details });
    }
    return new RepositoryError("VALIDATION_ERROR", { invariantCode: error.code, details });
  }
  if (error instanceof IllegalTransitionError) {
    return new RepositoryError("VALIDATION_ERROR", {
      reason: "INVALID_TRANSITION",
      details: { machine: error.machine, from: error.from, to: error.to },
    });
  }
  if (isForbiddenError(error)) {
    return new RepositoryError("FORBIDDEN", {
      reason: error.reason,
      details: { permission: error.permission },
    });
  }
  const message = error instanceof Error ? error.message : String(error);
  return new RepositoryError("INTERNAL", { details: { message } });
}
