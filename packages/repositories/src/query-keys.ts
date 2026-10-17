/**
 * Hierarchical TanStack Query keys for every repository read (each app writes thin hooks over
 * these; CLN-02 `clinicalKeys` prefixes them with the active facility). Mutations map to the
 * entity roots whose queries they invalidate (`invalidatesFor`).
 */
const ROOT = "laif" as const;

const entity = <N extends string>(name: N) => ({
  all: [ROOT, name] as const,
  list: (filter: unknown = {}) => [ROOT, name, "list", filter] as const,
  detail: (id: string) => [ROOT, name, "detail", id] as const,
  count: (filter: unknown = {}) => [ROOT, name, "count", filter] as const,
});

export const queryKeys = {
  all: [ROOT] as const,
  patients: {
    ...entity("patients"),
    matches: (input: unknown) => [ROOT, "patients", "matches", input] as const,
  },
  screenings: entity("screenings"),
  reviews: entity("reviews"),
  referrals: entity("referrals"),
  followUps: entity("followUps"),
  tasks: entity("tasks"),
  reminders: {
    ...entity("reminders"),
    byPatient: (patientId: string) => [ROOT, "reminders", "patient", patientId] as const,
  },
  careInstructions: {
    ...entity("careInstructions"),
    byPatient: (patientId: string) => [ROOT, "careInstructions", "patient", patientId] as const,
  },
  workers: {
    all: [ROOT, "workers"] as const,
    byFacility: (facilityId: string) => [ROOT, "workers", facilityId] as const,
  },
  metrics: {
    all: [ROOT, "metrics"] as const,
    aggregate: (filter: unknown = {}) => [ROOT, "metrics", filter] as const,
  },
  audit: entity("audit"),
  sync: {
    all: [ROOT, "sync"] as const,
    status: () => [ROOT, "sync", "status"] as const,
    ops: (filter: unknown = {}) => [ROOT, "sync", "ops", filter] as const,
  },
  demo: {
    all: [ROOT, "demo"] as const,
    state: () => [ROOT, "demo", "state"] as const,
    faults: () => [ROOT, "demo", "faults"] as const,
  },
} as const;

export type QueryEntity = Exclude<keyof typeof queryKeys, "all">;

/** Which entity roots each mutation invalidates (audit + sync always, since every write logs). */
export const MUTATION_INVALIDATIONS = {
  registerPatient: ["patients"],
  saveScreeningDraft: ["screenings"],
  discardScreeningDraft: ["screenings"],
  createScreening: ["screenings", "reviews", "patients", "metrics"],
  amendScreening: ["screenings", "reviews"],
  startReview: ["reviews"],
  decideReview: ["reviews", "referrals", "followUps", "screenings", "metrics"],
  createReferral: ["referrals", "reviews", "metrics"],
  transitionReferral: ["referrals", "followUps", "careInstructions", "metrics"],
  editReferral: ["referrals", "metrics"],
  createFollowUp: ["followUps", "tasks"],
  updateFollowUp: ["followUps", "tasks", "careInstructions", "metrics"],
  createTask: ["tasks"],
  updateTask: ["tasks"],
  requestCorrection: ["tasks"],
  setReminderPreference: ["reminders"],
  releaseCareInstruction: ["careInstructions", "reminders"],
  recordExport: [],
  recordAuditEvent: [],
  resolveConflict: ["followUps", "screenings", "patients", "reviews", "referrals"],
  resetDemo: [
    "patients",
    "screenings",
    "reviews",
    "referrals",
    "followUps",
    "tasks",
    "reminders",
    "careInstructions",
    "workers",
    "metrics",
    "demo",
  ],
  loadScenario: [
    "patients",
    "screenings",
    "reviews",
    "referrals",
    "followUps",
    "tasks",
    "reminders",
    "careInstructions",
    "workers",
    "metrics",
    "demo",
  ],
  setFaults: ["demo"],
} as const satisfies Record<string, readonly QueryEntity[]>;

export type MutationName = keyof typeof MUTATION_INVALIDATIONS;

/** Query-key roots to invalidate after `mutation` (always includes audit and sync). */
export function invalidatesFor(mutation: MutationName): ReadonlyArray<readonly string[]> {
  const roots = [...MUTATION_INVALIDATIONS[mutation], "audit", "sync"] as QueryEntity[];
  return [...new Set(roots)].map((name) => queryKeys[name].all);
}
