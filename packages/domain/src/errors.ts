/**
 * Domain error types. Both are plain `Error` subclasses with structured fields so callers
 * (repositories, UI) can map them to error codes / i18n keys without parsing messages.
 */

/** Codes thrown by `invariants.ts`. UI maps them to `domain:invariant.<code>` keys (FND-04). */
export const DOMAIN_INVARIANT_CODES = [
  "DECISION_NOT_ATTRIBUTABLE",
  "DISMISSAL_REASON_REQUIRED",
  "CANCELLATION_REASON_REQUIRED",
  "AMENDMENT_REASON_REQUIRED",
  "AMENDMENT_NOT_APPLICABLE",
  "COMPLETION_EVIDENCE_REQUIRED",
  "SCREENING_IMMUTABLE",
  "STALE_VERSION",
  "REMINDER_CANNOT_TRANSITION",
  "RETURN_TO_WORKER_NOT_ALLOWED",
] as const;
export type DomainInvariantCode = (typeof DOMAIN_INVARIANT_CODES)[number];

export class DomainInvariantError extends Error {
  readonly code: DomainInvariantCode;
  readonly details: Readonly<Record<string, unknown>>;

  constructor(code: DomainInvariantCode, details: Readonly<Record<string, unknown>> = {}) {
    super(`Domain invariant violated: ${code}`);
    this.name = "DomainInvariantError";
    this.code = code;
    this.details = details;
  }
}

export class IllegalTransitionError extends Error {
  readonly machine: string;
  readonly from: string;
  readonly to: string;

  constructor(machine: string, from: string, to: string) {
    super(`Illegal ${machine} transition: ${from} -> ${to}`);
    this.name = "IllegalTransitionError";
    this.machine = machine;
    this.from = from;
    this.to = to;
  }
}
