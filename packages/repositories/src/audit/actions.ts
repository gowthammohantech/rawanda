/**
 * THE audit action registry (FND-07 §6) — the single list of every `AuditEvent.action` any
 * package, seed or app may write. `emitAudit` refuses unregistered actions, and a test asserts
 * that every action in the seed, the scenarios and the repository is registered.
 *
 * Rules:
 * - Cross-cutting actions always use the canonical names (`session.*`, `access.denied`,
 *   `export.*`, `demo.reset`, `conflict.*`, `sync.duplicate_suppressed`, `task.created`,
 *   `correction.requested`, `*.viewed`) — never app-prefixed variants.
 * - App phases append their app-specific actions here, prefixed with the app area
 *   (`admin.programme_action.created`, `citizen.consent.granted`, `worker.…`, `clinical.…`).
 * - Every action has EN + RW copy at `domain:audit.<action>` (i18n test in this package).
 * - `client: true` marks UI-originated actions accepted by `recordAuditEvent` (route-guard
 *   denials, session events, demo tooling, UI-only views). Change events are never client-made.
 * - Seed history (FND-05) uses a few finer-grained names (`referral.accepted`,
 *   `screening.created`, `reminder_preference.set`, …); they are registered as-is (decision:
 *   keeps `SEED_DATASET_HASH` stable). Repository writes use the FND-07 names
 *   (`referral.transitioned`, `screening.submitted`, `reminder.preference_changed`, …).
 */
import type { AuditCategory } from "@laif/domain";

export type AuditActionSpec = {
  category: AuditCategory;
  /** Accepted by `recordAuditEvent` (UI-originated). */
  client?: true;
  /** Registered for FND-05 seed history only (the repository does not emit it). */
  seedOnly?: true;
};

const access = { category: "access" } as const;
const accessClient = { category: "access", client: true } as const;
const change = { category: "change" } as const;
const seedChange = { category: "change", seedOnly: true } as const;
const security = { category: "security" } as const;
const demo = { category: "demo" } as const;
const demoClient = { category: "demo", client: true } as const;

export const AUDIT_ACTIONS = {
  // ── Cross-cutting (canonical) ────────────────────────────────────────────
  "session.started": accessClient,
  "session.ended": accessClient,
  "session.expired": accessClient,
  "access.denied": accessClient,
  "export.requested": { category: "export", client: true },
  "export.generated": { category: "export" },
  "export.denied": { category: "export" },
  "demo.reset": demo,
  "demo.scenario_loaded": demo,
  "demo.fault_toggled": demoClient,
  "demo.clock_changed": demo,
  "demo.concurrent_update_simulated": demoClient,
  "demo.simulated_staff_action": demoClient,
  "demo.bundle_exported": demoClient,
  "demo.bundle_imported": demoClient,
  "conflict.detected": security,
  "conflict.resolved": { category: "security", client: true },
  "sync.duplicate_suppressed": security,
  "task.created": change,
  "correction.requested": change,

  // ── Sensitive reads (category access, de-duplicated per actor+entity+minute) ──
  "patient.viewed": access,
  "review.viewed": access,
  "audit.viewed": access,
  // UI-only views (recorded by apps through recordAuditEvent).
  "patient.searched": accessClient,
  "screening.history_viewed": accessClient,
  "referral.viewed": accessClient,
  "followup.viewed": accessClient,
  "queue.viewed": accessClient,

  // ── Patients ─────────────────────────────────────────────────────────────
  "patient.registered": change,
  "patient.match_flagged": change,
  "patient.consent_withdrawn": seedChange,

  // ── Screenings ───────────────────────────────────────────────────────────
  "screening.draft_saved": change,
  "screening.draft_discarded": change,
  "screening.submitted": change,
  "screening.amended": change,
  "screening.created": seedChange,
  "screening.evaluated": seedChange,

  // ── Reviews ──────────────────────────────────────────────────────────────
  "review.created": change,
  "review.started": change,
  "review.taken_over": change,
  "review.decided": change,
  "review.dismissed": change,

  // ── Referrals ────────────────────────────────────────────────────────────
  "referral.created": change,
  "referral.transitioned": change,
  "referral.accepted": seedChange,
  "referral.scheduled": seedChange,
  "referral.completed": seedChange,
  "referral.cancelled": seedChange,

  // ── Follow-ups ───────────────────────────────────────────────────────────
  "followup.created": change,
  "followup.assigned": change,
  "followup.reassigned": change,
  "followup.due_date_changed": change,
  "followup.attempt_recorded": change,
  "followup.outcome_recorded": change,
  "followup.note_added": change,
  "followup.completion_confirmed": change,
  "followup.returned_to_worker": change,
  "followup.unable_to_reach": seedChange,
  "followup.completed": seedChange,

  // ── Care tasks ───────────────────────────────────────────────────────────
  "task.updated": change,
  "task.started": seedChange,
  "task.completed": seedChange,

  // ── Reminders & instructions ─────────────────────────────────────────────
  "reminder.preference_changed": change,
  "reminder.scheduled": seedChange,
  "reminder.delivered_simulated": seedChange,
  "reminder.acknowledged": seedChange,
  "reminder.cancelled": seedChange,
  "reminder_preference.set": seedChange,
  "instruction.released": change,
  "instruction.withdrawn": seedChange,

  // ── Citizen wallet (CTZ-01; `citizen.reminder.*` maps to `reminder.preference_changed`) ──
  "citizen.consent.granted": change,
  "citizen.consent.withdrawn": change,
  "citizen.result.viewed": access,
  "citizen.next_step.acknowledged": change,
  "citizen.support.callback_requested": change,
  "citizen.settings.changed": change,

  // ── Sync & devices ───────────────────────────────────────────────────────
  "sync.op_acknowledged": change,
  "sync.op_rejected": change,
  "sync.conflict_resolved": security,
  "device.revoked": security,
  "device.restored": security,
} as const satisfies Record<string, AuditActionSpec>;

export type AuditAction = keyof typeof AUDIT_ACTIONS;

export const AUDIT_ACTION_NAMES = Object.keys(AUDIT_ACTIONS) as AuditAction[];

export function isAuditAction(value: string): value is AuditAction {
  return Object.hasOwn(AUDIT_ACTIONS, value);
}

export function auditActionSpec(action: AuditAction): AuditActionSpec {
  return AUDIT_ACTIONS[action];
}

/** Actions `recordAuditEvent` accepts from UIs. */
export const CLIENT_AUDIT_ACTIONS = AUDIT_ACTION_NAMES.filter(
  (a) => (AUDIT_ACTIONS[a] as AuditActionSpec).client === true,
);

export function isClientAuditAction(value: string): value is AuditAction {
  return isAuditAction(value) && (AUDIT_ACTIONS[value] as AuditActionSpec).client === true;
}

/** i18n key of an action's label (namespace `domain`). */
export const auditActionLabelKey = (action: AuditAction): `domain:audit.${AuditAction}` =>
  `domain:audit.${action}`;
