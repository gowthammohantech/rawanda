import type {
  AuditEvent,
  CareInstruction,
  CareTask,
  DemoPersona,
  DemoRuleset,
  District,
  Facility,
  FollowUp,
  Patient,
  Referral,
  Reminder,
  ReminderPreference,
  Review,
  Screening,
  SyncOperation,
} from "@laif/domain";

export const SEED_VERSION = "seed-v1" as const;
export const SEED_DEFAULT = 20261016;
export const SYNTHETIC_DATA_NOTICE = "SYNTHETIC DEMONSTRATION DATA — NOT FOR CLINICAL USE" as const;

export type SeedMeta = {
  seedVersion: typeof SEED_VERSION;
  seed: number;
  demoClockIso: string;
  generatedFor: typeof SYNTHETIC_DATA_NOTICE;
};

/**
 * The full synthetic dataset. Collection keys equal the FND-07 `COLLECTIONS` names, so a store
 * can `bulkPut` each array directly.
 */
export type SeedDataset = {
  meta: SeedMeta;
  districts: District[];
  facilities: Facility[];
  personas: DemoPersona[];
  patients: Patient[];
  screenings: Screening[];
  reviews: Review[];
  referrals: Referral[];
  followUps: FollowUp[];
  careTasks: CareTask[];
  reminders: Reminder[];
  reminderPreferences: ReminderPreference[];
  careInstructions: CareInstruction[];
  auditEvents: AuditEvent[];
  rulesets: DemoRuleset[];
  syncOperations: SyncOperation[];
};

export type SeedCollectionName = Exclude<keyof SeedDataset, "meta">;

export const SEED_COLLECTIONS = [
  "districts",
  "facilities",
  "personas",
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
  "rulesets",
  "syncOperations",
] as const satisfies readonly SeedCollectionName[];

/** Entity type (FND-02 `ENTITY_TYPES`, key of `ENTITY_SCHEMAS`) of each collection. */
export const COLLECTION_ENTITY_TYPES = {
  districts: "district",
  facilities: "facility",
  personas: "persona",
  patients: "patient",
  screenings: "screening",
  reviews: "review",
  referrals: "referral",
  followUps: "follow_up",
  careTasks: "care_task",
  reminders: "reminder",
  reminderPreferences: "reminder_preference",
  careInstructions: "care_instruction",
  auditEvents: "audit_event",
  rulesets: "ruleset",
  syncOperations: "sync_operation",
} as const satisfies Record<SeedCollectionName, string>;

export type CreateSeedOptions = {
  /** PRNG seed (names, readings, minor timing). IDs never depend on it. */
  seed?: number;
  /** Demo clock instant every timestamp is offset from (default `DEMO_CLOCK_DEFAULT_ISO`). */
  nowIso?: string;
};
