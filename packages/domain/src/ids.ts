/**
 * Branded ID types. IDs are opaque strings (UUIDs at runtime, stable readable IDs in seeds);
 * the brand only prevents passing e.g. a `ScreeningId` where a `PatientId` is expected.
 *
 * Runtime UUID generators are injected by repositories (web `crypto.randomUUID`, native
 * `expo-crypto`, FND-08). This package only ships the deterministic sequential generator.
 */

declare const brand: unique symbol;

export type Brand<T, B extends string> = T & { readonly [brand]: B };

export type PatientId = Brand<string, "PatientId">;
export type ScreeningId = Brand<string, "ScreeningId">;
export type ScreeningAmendmentId = Brand<string, "ScreeningAmendmentId">;
export type ReviewId = Brand<string, "ReviewId">;
export type ReferralId = Brand<string, "ReferralId">;
export type FollowUpId = Brand<string, "FollowUpId">;
export type ContactAttemptId = Brand<string, "ContactAttemptId">;
export type CareTaskId = Brand<string, "CareTaskId">;
export type ReminderId = Brand<string, "ReminderId">;
export type ReminderPreferenceId = Brand<string, "ReminderPreferenceId">;
export type CareInstructionId = Brand<string, "CareInstructionId">;
export type AuditEventId = Brand<string, "AuditEventId">;
export type FacilityId = Brand<string, "FacilityId">;
export type DistrictId = Brand<string, "DistrictId">;
export type PersonaId = Brand<string, "PersonaId">;
export type SyncOperationId = Brand<string, "SyncOperationId">;
export type DeviceSessionId = Brand<string, "DeviceSessionId">;
export type DeviceId = Brand<string, "DeviceId">;
export type CorrelationId = Brand<string, "CorrelationId">;

/** Produces a fresh opaque ID string. */
export type IdGenerator = () => string;

/** Casts a raw string to a branded ID (seed data, schema parsing, generator output). */
export function asId<T extends Brand<string, string>>(value: string): T {
  return value as T;
}

/**
 * Deterministic generator for tests and seeds: `pat-000001`, `pat-000002`, …
 * Each call to `createSequentialIdGenerator` starts its own counter.
 */
export function createSequentialIdGenerator(prefix: string, start = 1): IdGenerator {
  let next = start;
  return () => {
    const id = `${prefix}-${String(next).padStart(6, "0")}`;
    next += 1;
    return id;
  };
}
