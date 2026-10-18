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
  "demo.slice_refreshed": demo,
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
  // CLN-08: destination / due-date edit of an open referral (status changes stay
  // `referral.transitioned`, whose changeSummary carries from → to + evidence / cancel reason).
  "clinical.referral.updated": change,

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
  // CTZ-05: also written by the citizen repository (scheduling / simulated delivery / "Got it").
  "reminder.scheduled": change,
  "reminder.delivered_simulated": change,
  "reminder.acknowledged": change,
  "reminder.cancelled": change,
  "reminder_preference.set": seedChange,
  "instruction.released": change,
  "instruction.withdrawn": seedChange,

  // ── Citizen wallet (CTZ-01; `citizen.reminder.*` maps to `reminder.preference_changed`) ──
  "citizen.consent.granted": change,
  "citizen.consent.withdrawn": change,
  "citizen.result.viewed": access,
  // CTZ-03: the "My health" results list was shown (once per screen focus).
  "citizen.result.list_viewed": access,
  "citizen.next_step.acknowledged": change,
  // CTZ-04: the Next steps list was shown (once per focus) / one approved step was opened.
  "citizen.next_step.list_viewed": access,
  "citizen.next_step.viewed": access,
  "citizen.support.callback_requested": change,
  "citizen.settings.changed": change,
  // CTZ-05: an on-device test notification (generic text only) was requested by the citizen.
  "citizen.reminder.preview_sent": change,
  // CTZ-06: the Timeline tab was shown (once per focus) / a "what changed" sheet was opened.
  "citizen.timeline.viewed": access,
  "citizen.change.viewed": access,
  // CTZ-07: privacy notice / access history / one correction request shown; a second request
  // for the same record while one is still open was blocked (nothing written).
  "citizen.privacy_notice.viewed": access,
  "citizen.access_history.viewed": access,
  "citizen.correction.viewed": access,
  "citizen.correction.duplicate_blocked": security,
  // CTZ-08: Support / Help topics shown (once per focus; persona-level, no health data).
  "citizen.support.viewed": access,
  "citizen.help.viewed": access,
  // CTZ-02: persona choice + simulated identity verification (demo code, never a real check).
  "citizen.persona.selected": access,
  "citizen.identity.verification_attempted": security,
  "citizen.identity.verified": change,
  "citizen.identity.verification_failed": security,
  "citizen.identity.verification_unavailable": security,

  // ── Programme admin (ADM-03) ────────────────────────────────────────────
  // Aggregate drill-down view (PRD §8 sensitive-read logging), recorded by the admin UI once per
  // (session, stage, search). Denials / conflicts of programme actions use the canonical
  // `access.denied` / `conflict.detected` (entityType `programme_action`).
  "admin.drilldown.viewed": accessClient,
  "admin.programme_action.created": change,
  "admin.programme_action.status_changed": change,
  // ── Programme admin (ADM-06) ────────────────────────────────────────────
  // Phase prose `system.quality_issue.detected` → app-area prefix rule: `admin.quality_issue.detected`
  // (actor = system: actorId / actorRole null), one per NEW issue id. `admin.quality_issue.conflict`
  // / `.denied` map to the canonical `conflict.detected` / `access.denied` (entityType
  // `data_quality_issue`). Triage audits carry the note LENGTH, never the note text.
  "admin.quality_issue.detected": change,
  "admin.quality_issue.triaged": change,
  // ── Programme admin (ADM-08) ────────────────────────────────────────────
  // Governance audit-log view (an access audit of the audit log, once per session + filter key)
  // and access-simulator runs are recorded by the admin UI. Grant edits / revocations are change
  // events of `updateAccessGrant` (before/after, justification, version n → n+1). Phase prose
  // `admin.access_grant.conflict` / `.denied` map to the canonical `conflict.detected` /
  // `access.denied` (entityType `access_grant`; `LAST_ADMIN` is the denial reason of the lockout
  // rule), as for ADM-06.
  "admin.audit.viewed": accessClient,
  "admin.access_simulation.run": accessClient,
  "admin.access_grant.changed": change,
  "admin.access_grant.revoked": change,

  // ── Health worker app (HWM-09; phase names `sync.manual_requested` /
  // `sync.duplicate_tap_coalesced` are UI-originated, so app-prefixed) ─────────
  "worker.sync.manual_requested": accessClient,
  "worker.sync.duplicate_tap_coalesced": accessClient,
  // HWM-10: phase names `settings.language_changed` / `sync.clock_drift_detected` are
  // UI-originated (the language switcher; the device-clock check after a sync run), so
  // app-prefixed. `settings.network_sim_changed` maps to the canonical `demo.fault_toggled`.
  "worker.settings.language_changed": { category: "change", client: true },
  "worker.sync.clock_drift_detected": { category: "security", client: true },

  // ── Sync & devices ───────────────────────────────────────────────────────
  "sync.op_acknowledged": change,
  "sync.op_rejected": change,
  "sync.conflict_resolved": security,
  // HWM-09: emitted by the FND-07 sync queue (cross-cutting, unprefixed like `sync.op_*`).
  // `sync.run_*` only for runs with something to send (or manual); `sync.retry_scheduled` per
  // retryable failure with its next attempt time.
  "sync.run_started": change,
  "sync.run_finished": change,
  "sync.retry_scheduled": change,
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
