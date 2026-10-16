/**
 * Write results and the error envelope (tech spec §4, FRD §6).
 *
 * Error codes (decision, FND-03): the FRD taxonomy has 5 codes — `VALIDATION_ERROR`,
 * `FORBIDDEN`, `NOT_FOUND`, `CONFLICT`, `DEPENDENCY_UNAVAILABLE`. `TIMEOUT`, `OFFLINE` and
 * `INTERNAL` are added for the simulated transport (spec §4: latency / timeout / 500 / offline).
 *
 * App-specific failure causes are `ErrorReason`s on these 8 codes — NEVER new codes:
 * HWM `DEVICE_REVOKED` / `TASK_REASSIGNED` → `FORBIDDEN`; CTZ `CONSENT_REQUIRED` → `FORBIDDEN`;
 * CLN `ALREADY_DECIDED` / `REFERRAL_ALREADY_OPEN` → `CONFLICT`; ADM `LAST_ADMIN` →
 * `VALIDATION_ERROR`; idempotency key reuse with a different payload → `VALIDATION_ERROR`.
 * The thrown class is `RepositoryError` (FND-07); there is no separate `AppError`.
 */
import type { DomainInvariantCode, JsonValue } from "@laif/domain";
import { z } from "zod";

import type { ParsedValidationMessage } from "./messages.ts";
import { IsoUtcString, Version } from "./primitives.ts";

export const ERROR_CODES = [
  "VALIDATION_ERROR",
  "FORBIDDEN",
  "NOT_FOUND",
  "CONFLICT",
  "DEPENDENCY_UNAVAILABLE",
  "TIMEOUT",
  "OFFLINE",
  "INTERNAL",
] as const;
export type ErrorCode = (typeof ERROR_CODES)[number];

/** HTTP-equivalent status per code (`OFFLINE` = 0: the request never left the device). */
export const HTTP_STATUS_BY_CODE = {
  VALIDATION_ERROR: 422,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  CONFLICT: 409,
  DEPENDENCY_UNAVAILABLE: 503,
  TIMEOUT: 504,
  OFFLINE: 0,
  INTERNAL: 500,
} as const satisfies Record<ErrorCode, number>;

export const ERROR_REASONS = [
  "ROLE",
  "SCOPE",
  "SESSION_REVOKED",
  "DEVICE_REVOKED",
  "TASK_REASSIGNED",
  "WORKER_NOT_AUTHORISED",
  "CONSENT_REQUIRED",
  "LAST_ADMIN",
  "ALREADY_DECIDED",
  "REFERRAL_ALREADY_OPEN",
  "INVALID_TRANSITION",
  "IDEMPOTENCY_KEY_REUSED",
  "DUPLICATE_OPEN_REQUEST",
] as const;
export type ErrorReason = (typeof ERROR_REASONS)[number];

/** Codes after which retrying with the SAME idempotency key is safe and useful. */
export const RETRYABLE_ERROR_CODES = [
  "DEPENDENCY_UNAVAILABLE",
  "TIMEOUT",
  "OFFLINE",
  "INTERNAL",
] as const satisfies readonly ErrorCode[];

export function isErrorCode(value: unknown): value is ErrorCode {
  return typeof value === "string" && (ERROR_CODES as readonly string[]).includes(value);
}

export function isRetryableErrorCode(code: ErrorCode): boolean {
  return (RETRYABLE_ERROR_CODES as readonly ErrorCode[]).includes(code);
}

/** Every write returns this envelope (spec §4). `replayed: true` = idempotent replay. */
export type WriteResult<T> = {
  data: T;
  eventId: string;
  entityVersion: number;
  updatedAt: string;
  auditEventId: string;
  replayed: boolean;
};

/** Payload of a `CONFLICT` (409): the latest entity is always included. */
export type ConflictDetails<T> = {
  entityType: string;
  entityId: string;
  expectedVersion: number;
  currentVersion: number;
  latest: T;
  changedBy?: string;
  changedAt?: string;
};

export type Page<T> = { items: T[]; total: number; page: number; pageSize: number };

/**
 * Error envelope of every repository failure (thrown as `RepositoryError`, FND-07).
 * - `invariantCode`: set when a `DomainInvariantError` was mapped to `VALIDATION_ERROR` (FND-07
 *   decision); UIs render it via `domain:invariant.<code>`.
 * - `details`: small, non-identifying diagnostic JSON (never shown verbatim to users).
 */
export type RepositoryErrorShape = {
  code: ErrorCode;
  status: number;
  reason?: ErrorReason;
  fieldErrors?: Record<string, ParsedValidationMessage>;
  conflict?: ConflictDetails<unknown>;
  invariantCode?: DomainInvariantCode;
  details?: { [key: string]: JsonValue };
};

/** Schema for a `WriteResult<T>` (import paths, transport round-trips). */
export function writeResultSchema<T extends z.ZodType>(data: T) {
  return z.object({
    data,
    eventId: z.string().min(1),
    entityVersion: Version,
    updatedAt: IsoUtcString,
    auditEventId: z.string().min(1),
    replayed: z.boolean(),
  });
}

/** Schema for a `Page<T>`. */
export function pageSchema<T extends z.ZodType>(item: T) {
  return z.object({
    items: z.array(item),
    total: z.number().int().min(0),
    page: z.number().int().min(1),
    pageSize: z.number().int().min(1),
  });
}

/** Builds an error shape with the status implied by the code. */
export function makeErrorShape(
  code: ErrorCode,
  extra: Omit<RepositoryErrorShape, "code" | "status"> = {},
): RepositoryErrorShape {
  return { code, status: HTTP_STATUS_BY_CODE[code], ...extra };
}
