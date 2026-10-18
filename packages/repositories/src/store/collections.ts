/**
 * The `COLLECTIONS` registry — declared here, once (FND-07 task 1). FND-08's Dexie schema v1 and
 * SQLite `records` table already contain every collection listed, so no app phase needs a SQL
 * migration or a Dexie version bump. App phases that discover a missing collection add it to this
 * registry (with a Dexie version bump in the same commit) — never app-local tables, separate
 * database files or `ctz_*` / `outbox_*` schemas.
 */
import type { EntityType } from "@laif/domain";

/** Core clinical / sync collections (the seed's collection keys are a subset). */
export const CORE_COLLECTIONS = [
  "patients",
  "screenings",
  "reviews",
  "referrals",
  "followUps",
  "careTasks",
  "reminders",
  "reminderPreferences",
  "careInstructions",
  "auditEvents",
  "idempotency",
  "syncOperations",
  "syncRuns",
  "deviceSessions",
  "facilities",
  "districts",
  "personas",
  "rulesets",
] as const;

/** Programme Admin collections (ADM-01..09). */
export const ADMIN_COLLECTIONS = [
  "accessGrants",
  "timeEntries",
  "programmeActions",
  "dataQualityIssues",
  "exportAudits",
] as const;

/** Citizen Health Wallet collections (CTZ-01..08). */
export const CITIZEN_COLLECTIONS = [
  "citizenAccounts",
  "patientLinks",
  "identityVerifications",
  "consentRecords",
  "nextStepAcks",
  "citizenSettings",
  "accessEvents",
] as const;

export const LOCAL_COLLECTIONS = [
  ...CORE_COLLECTIONS,
  ...ADMIN_COLLECTIONS,
  ...CITIZEN_COLLECTIONS,
] as const;
export type LocalCollectionName = (typeof LOCAL_COLLECTIONS)[number];

/** Prefix of the simulated remote's authoritative copy (FND-07 task 8). */
export const REMOTE_PREFIX = "remote_" as const;
export type RemoteCollectionName = `${typeof REMOTE_PREFIX}${LocalCollectionName}`;

/** `remote_*` mirrors — used only by `createSimulatedRemote`. */
export const REMOTE_COLLECTIONS: readonly RemoteCollectionName[] = LOCAL_COLLECTIONS.map(
  (name): RemoteCollectionName => `${REMOTE_PREFIX}${name}`,
);

/** Every collection a store adapter must support (Dexie table / SQLite `collection` value). */
export const COLLECTIONS: readonly CollectionName[] = [...LOCAL_COLLECTIONS, ...REMOTE_COLLECTIONS];
export type CollectionName = LocalCollectionName | RemoteCollectionName;

export function isCollectionName(value: string): value is CollectionName {
  return (COLLECTIONS as readonly string[]).includes(value);
}

export function isLocalCollectionName(value: string): value is LocalCollectionName {
  return (LOCAL_COLLECTIONS as readonly string[]).includes(value);
}

export function remoteCollection(name: LocalCollectionName): RemoteCollectionName {
  return `${REMOTE_PREFIX}${name}`;
}

/** Collection of each domain entity type (audit events, sync ops and `simulate*` helpers). */
export const ENTITY_COLLECTIONS = {
  patient: "patients",
  screening: "screenings",
  review: "reviews",
  referral: "referrals",
  follow_up: "followUps",
  care_task: "careTasks",
  care_instruction: "careInstructions",
  reminder: "reminders",
  reminder_preference: "reminderPreferences",
  audit_event: "auditEvents",
  facility: "facilities",
  district: "districts",
  persona: "personas",
  ruleset: "rulesets",
  sync_operation: "syncOperations",
  device_session: "deviceSessions",
  programme_action: "programmeActions",
  data_quality_issue: "dataQualityIssues",
  export_audit: "exportAudits",
} as const satisfies Record<EntityType, LocalCollectionName>;

const ENTITY_ALIASES: Readonly<Record<string, EntityType>> = Object.fromEntries([
  ...Object.entries(ENTITY_COLLECTIONS).flatMap(([type, collection]) => [
    [type, type],
    [collection, type],
  ]),
  // camelCase spellings used in app phase prose (`simulateExternalUpdate('followUp', …)`).
  ["followUp", "follow_up"],
  ["careTask", "care_task"],
  ["careInstruction", "care_instruction"],
  ["reminderPreference", "reminder_preference"],
  ["auditEvent", "audit_event"],
  ["syncOperation", "sync_operation"],
  ["deviceSession", "device_session"],
  ["programmeAction", "programme_action"],
  ["dataQualityIssue", "data_quality_issue"],
  ["exportAudit", "export_audit"],
]) as Record<string, EntityType>;

/** Accepts an entity type (`follow_up`), a collection (`followUps`) or camelCase (`followUp`). */
export function resolveEntityType(value: string): EntityType | null {
  return ENTITY_ALIASES[value] ?? null;
}
