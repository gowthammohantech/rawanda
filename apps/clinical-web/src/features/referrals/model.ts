/**
 * Referral tracking model (CLN-08): URL state, tab predicates, stepper view model, allowed next
 * actions and KPI derivations. Pure functions only (no React, no wall clock).
 *
 * - Tabs (task 2): Open = not terminal; Overdue = derived (`isReferralOverdue`: `dueAt < now`
 *   and not terminal — never a stored status); Completed; Cancelled; All. Each tab maps onto the
 *   SAME repository filter for the list and `countReferrals`, so a badge always equals its rows.
 * - URL (task 3): `?tab=&facility=&q=&id=`. `facility` filters by DESTINATION facility (the
 *   repository actor is already narrowed to the active facility, CLN-02); `id` opens the drawer.
 * - Stepper (task 4): `Created → Accepted → Scheduled → Completed`, timestamps + actors from the
 *   referral and its audit history (`referral.created`, `referral.transitioned` {to}, seed
 *   `referral.accepted|scheduled|completed|cancelled`); cancellation is a terminal branch.
 */
import type { ReferralFilterInput } from "@laif/repositories";
import {
  isReferralOverdue,
  referralMachine,
  type AuditEvent,
  type PersonaId,
  type Referral,
  type ReferralStatus,
} from "@laif/domain";
import { KIGALI_UTC_OFFSET_MS } from "@laif/i18n";

export const REFERRAL_TABS = ["open", "overdue", "completed", "cancelled", "all"] as const;
export type ReferralTab = (typeof REFERRAL_TABS)[number];
export const DEFAULT_REFERRAL_TAB: ReferralTab = "open";

/** Max length of the `q` search (matches `ReferralFilterSchema.q`). */
export const REFERRAL_QUERY_MAX = 60;

export type ReferralParams = {
  tab: ReferralTab;
  /** Destination facility filter. */
  facility: string | null;
  q: string;
  /** Referral shown in the drawer. */
  id: string | null;
};

const isTab = (value: unknown): value is ReferralTab =>
  typeof value === "string" && (REFERRAL_TABS as readonly string[]).includes(value);

export function parseReferralParams(
  params: URLSearchParams,
  facilityIds: readonly string[],
): ReferralParams {
  const tab = params.get("tab");
  const facility = params.get("facility");
  const q = (params.get("q") ?? "").trim().slice(0, REFERRAL_QUERY_MAX);
  const id = params.get("id");
  return {
    tab: isTab(tab) ? tab : DEFAULT_REFERRAL_TAB,
    facility: facility !== null && facilityIds.includes(facility) ? facility : null,
    q,
    id: id === null || id.trim() === "" ? null : id,
  };
}

export type ReferralParamsPatch = Partial<ReferralParams>;

/** Applies `patch` to the URL params; defaults are omitted. */
export function patchReferralParams(
  current: URLSearchParams,
  patch: ReferralParamsPatch,
): URLSearchParams {
  const out = new URLSearchParams(current);
  const set = (name: string, value: string | null | undefined, fallback?: string) => {
    if (value === null || value === undefined || value === "" || value === fallback) {
      out.delete(name);
    } else out.set(name, value);
  };
  if ("tab" in patch) set("tab", patch.tab, DEFAULT_REFERRAL_TAB);
  if ("facility" in patch) set("facility", patch.facility);
  if ("q" in patch) set("q", patch.q?.trim());
  if ("id" in patch) set("id", patch.id);
  return out;
}

/** The filter shared by every tab (destination + search). */
export type ReferralScope = { facility: string | null; q: string };

export const scopeFilter = (scope: ReferralScope): ReferralFilterInput => ({
  ...(scope.facility === null ? {} : { destinationFacilityIds: [scope.facility] }),
  ...(scope.q === "" ? {} : { q: scope.q }),
});

const OPEN_STATUSES = ["created", "accepted", "scheduled"] as const;

/** Tab → repository filter (same predicate for list and counts). */
export function tabFilter(tab: ReferralTab): ReferralFilterInput {
  switch (tab) {
    case "open":
      return { statuses: [...OPEN_STATUSES] };
    case "overdue":
      return { overdueOnly: true };
    case "completed":
      return { statuses: ["completed"] };
    case "cancelled":
      return { statuses: ["cancelled_with_reason"] };
    case "all":
      return {};
  }
}

/** `countReferrals` result → the count of a tab. */
export function tabCount(counts: Readonly<Record<string, number>>, tab: ReferralTab): number {
  const key = tab === "cancelled" ? "cancelled_with_reason" : tab;
  return counts[key] ?? 0;
}

export const isReferralOpen = (r: Pick<Referral, "status">): boolean =>
  !referralMachine.terminal.includes(r.status);

/** In-memory version of a tab predicate (tests, row checks). */
export function matchesTab(r: Referral, tab: ReferralTab, now: Date): boolean {
  switch (tab) {
    case "open":
      return isReferralOpen(r);
    case "overdue":
      return isReferralOverdue(r, now);
    case "completed":
      return r.status === "completed";
    case "cancelled":
      return r.status === "cancelled_with_reason";
    case "all":
      return true;
  }
}

// ── Actions ──────────────────────────────────────────────────────────────────

export type ReferralAction = "accept" | "schedule" | "edit" | "complete" | "cancel";

export type ActionCapabilities = { manage: boolean; complete: boolean };

/**
 * Only the legal next transitions of the FND-02 machine render (task 5): accept (created),
 * schedule (accepted), complete (scheduled, `referral.complete`), cancel / edit (any open,
 * `referral.manage`).
 */
export function allowedActions(status: ReferralStatus, caps: ActionCapabilities): ReferralAction[] {
  const out: ReferralAction[] = [];
  const next = referralMachine.next(status);
  if (caps.manage && next.includes("accepted")) out.push("accept");
  if (caps.manage && next.includes("scheduled")) out.push("schedule");
  if (caps.complete && next.includes("completed")) out.push("complete");
  if (caps.manage && next.length > 0) out.push("edit");
  if (caps.manage && next.includes("cancelled_with_reason")) out.push("cancel");
  return out;
}

// ── Stepper ──────────────────────────────────────────────────────────────────

export const STEP_STATUSES = ["created", "accepted", "scheduled", "completed"] as const;
export type StepId = (typeof STEP_STATUSES)[number];

export type StepView = {
  id: StepId;
  state: "done" | "current" | "upcoming";
  at: string | null;
  actorId: PersonaId | null;
};

export type ReferralStepsView = {
  steps: StepView[];
  cancelled: { at: string | null; actorId: PersonaId | null } | null;
};

const SEED_ACTION: Partial<Record<ReferralStatus, string>> = {
  created: "referral.created",
  accepted: "referral.accepted",
  scheduled: "referral.scheduled",
  completed: "referral.completed",
  cancelled_with_reason: "referral.cancelled",
};

/** The audit event that moved the referral INTO `status` (latest wins). */
export function stepEvent(
  history: readonly AuditEvent[],
  status: ReferralStatus,
): AuditEvent | null {
  let found: AuditEvent | null = null;
  for (const event of history) {
    const summary = event.changeSummary as { to?: unknown } | null;
    const matches =
      event.action === SEED_ACTION[status] ||
      (event.action === "referral.transitioned" &&
        typeof summary === "object" &&
        summary !== null &&
        summary.to === status);
    if (matches && (found === null || event.occurredAt >= found.occurredAt)) found = event;
  }
  return found;
}

const REACHED: Record<ReferralStatus, number> = {
  created: 0,
  accepted: 1,
  scheduled: 2,
  completed: 3,
  cancelled_with_reason: -1,
};

/** Index of the furthest step reached (cancelled: from the history, else from the record). */
function reachedIndex(referral: Referral, history: readonly AuditEvent[]): number {
  if (referral.status !== "cancelled_with_reason") return REACHED[referral.status];
  if (referral.appointmentAt !== null || stepEvent(history, "scheduled") !== null) return 2;
  if (stepEvent(history, "accepted") !== null) return 1;
  return 0;
}

export function referralSteps(
  referral: Referral,
  history: readonly AuditEvent[],
  fallbackCreatorId: PersonaId | null = null,
): ReferralStepsView {
  const reached = reachedIndex(referral, history);
  const cancelled = referral.status === "cancelled_with_reason";
  const steps = STEP_STATUSES.map((id, index): StepView => {
    const event = stepEvent(history, id);
    let at = event?.occurredAt ?? null;
    let actorId = event?.actorId ?? null;
    if (id === "created") {
      at = at ?? referral.requestedAt;
      actorId = actorId ?? fallbackCreatorId;
    }
    if (id === "completed" && referral.completionEvidence !== null) {
      at = referral.completedAt ?? referral.completionEvidence.recordedAt;
      actorId = actorId ?? referral.completionEvidence.recordedBy;
    }
    // The step of the current status is `current`; a completed or cancelled referral has none.
    const state: StepView["state"] =
      index > reached
        ? "upcoming"
        : index < reached || referral.status === "completed" || cancelled
          ? "done"
          : "current";
    return {
      id,
      state,
      at: index <= reached ? at : null,
      actorId: index <= reached ? actorId : null,
    };
  });
  const cancelEvent = cancelled ? stepEvent(history, "cancelled_with_reason") : null;
  return {
    steps,
    cancelled: cancelled
      ? { at: cancelEvent?.occurredAt ?? referral.updatedAt, actorId: cancelEvent?.actorId ?? null }
      : null,
  };
}

// ── KPIs ─────────────────────────────────────────────────────────────────────

const DAY_MS = 86_400_000;

/** `YYYY-MM` of an instant in Kigali wall time. */
export function kigaliMonth(iso: string): string {
  return new Date(Date.parse(iso) + KIGALI_UTC_OFFSET_MS).toISOString().slice(0, 7);
}

export function completedThisMonth(completed: readonly Referral[], nowIso: string): number {
  const month = kigaliMonth(nowIso);
  return completed.filter(
    (r) =>
      r.status === "completed" && r.completedAt !== null && kigaliMonth(r.completedAt) === month,
  ).length;
}

/** Median whole days from request to completion (demo KPI); null when nothing completed. */
export function medianDaysToCompletion(completed: readonly Referral[]): number | null {
  const days = completed
    .filter((r) => r.status === "completed" && r.completedAt !== null)
    .map((r) => Math.max(0, (Date.parse(r.completedAt ?? "") - Date.parse(r.requestedAt)) / DAY_MS))
    .sort((a, b) => a - b);
  if (days.length === 0) return null;
  const mid = Math.floor(days.length / 2);
  const value = days.length % 2 === 1 ? days[mid]! : (days[mid - 1]! + days[mid]!) / 2;
  return Math.round(value * 10) / 10;
}
