/**
 * Demo sign-in / sign-out (ADM-01 task 5, FRD Scenario 1 steps 1–2). Starting a session writes
 * the session `{ personaId, grantId, grantVersion, startedAt, correlationId }` and emits
 * `session.started`; ending one emits `session.ended`. DEMO ROLE SWITCH — NOT AUTHENTICATION.
 */
import { roleHasPermission } from "@laif/auth-demo";
import type { AccessGrant } from "@laif/contracts";
import { asId, type CorrelationId, type DistrictId, type PersonaId } from "@laif/domain";

import { BASE_PATH, LOGIN_PATH, START_PATH } from "../app/config.ts";
import type { AppServices } from "../app/services.ts";
import { emitAdminAudit } from "../lib/audit.ts";
import type { AdminPersona } from "./personas.ts";
import { grantDistrictIds, grantFacilityIds } from "./scope.ts";
import type { AdminSession } from "./sessionStore.ts";

/**
 * The "Choose reporting scope" step is shown when the grant covers more than one district and
 * the persona can narrow its reporting (drill-down roles). The auditor reviews governance
 * programme-wide, so its scope is fixed to all districts in its grant.
 */
export function needsScopeChoice(persona: AdminPersona, grant: AccessGrant): boolean {
  return (
    grantDistrictIds(persona, grant).length > 1 &&
    roleHasPermission(persona.role, "metrics.drilldown")
  );
}

/** The default reporting district: the only district of a single-district grant, else null. */
export function defaultReportingDistrict(
  persona: AdminPersona,
  grant: AccessGrant,
): DistrictId | null {
  const districts = grantDistrictIds(persona, grant);
  return districts.length === 1 ? asId<DistrictId>(districts[0] ?? "") : null;
}

/** Search string of the persona's own scope (`?district=` / `?facility=` / none for "all"). */
export function homeScopeSearch(
  persona: AdminPersona,
  grant: AccessGrant | null,
  reportingDistrictId: string | null,
): string {
  if (reportingDistrictId !== null) return `?district=${encodeURIComponent(reportingDistrictId)}`;
  if (grantDistrictIds(persona, grant).length > 0) return "";
  const facilities = grantFacilityIds(persona, grant);
  return facilities.length === 1 ? `?facility=${encodeURIComponent(facilities[0] ?? "")}` : "";
}

export function homePathFor(
  persona: AdminPersona,
  grant: AccessGrant | null,
  reportingDistrictId: string | null,
): string {
  return `${START_PATH}${homeScopeSearch(persona, grant, reportingDistrictId)}`;
}

/** Only same-app paths are accepted as `next` (no open redirect, never back to the login). */
export function safeNext(next: string | null): string | null {
  if (next === null) return null;
  if (!next.startsWith(`${BASE_PATH}/`) || next.startsWith("//")) return null;
  if (next === LOGIN_PATH || next.startsWith(`${LOGIN_PATH}?`)) return null;
  return next;
}

export function loginPathFor(next: string | null, personaId?: string): string {
  const params = new URLSearchParams();
  if (next !== null) params.set("next", next);
  if (personaId !== undefined) params.set("persona", personaId);
  const query = params.toString();
  return query === "" ? LOGIN_PATH : `${LOGIN_PATH}?${query}`;
}

export type StartSessionInput = {
  persona: AdminPersona;
  grant: AccessGrant;
  reportingDistrictId: DistrictId | null;
  /** ADM-08 access simulator "Try it": the persona to offer "Return to …" for. */
  returnToPersonaId?: PersonaId | null;
};

/** Signs in and records `session.started`; if the audit write fails the session is undone. */
export async function startAdminSession(
  services: Pick<AppServices, "session" | "repo" | "clock" | "ids">,
  input: StartSessionInput,
): Promise<AdminSession> {
  const session = services.session.signIn({
    ...input,
    startedAt: services.clock.nowIso(),
    correlationId: asId<CorrelationId>(services.ids()),
  });
  try {
    await emitAdminAudit(services.repo, session, {
      action: "session.started",
      changeSummary: { reportingDistrictId: input.reportingDistrictId },
    });
  } catch (error) {
    services.session.signOut();
    throw error;
  }
  return session;
}

/** Records `session.ended` (best effort — signing out always succeeds) and signs out. */
export async function endAdminSession(
  services: Pick<AppServices, "session" | "repo" | "queryClient">,
): Promise<void> {
  const { session } = services.session.getState();
  if (session !== null) {
    try {
      await emitAdminAudit(services.repo, session, { action: "session.ended" });
    } catch {
      // The demo session still ends; the failed audit write is visible as a toast elsewhere.
    }
  }
  services.session.signOut();
  services.queryClient.removeQueries({ queryKey: ["admin", "scoped"] });
}

/**
 * Demo persona switch without passing through "signed out" (ADM-08 access simulator "Try it" and
 * "Return to …"): records `session.ended` for the current session (best effort), then starts
 * the new one (`session.started`). Scoped caches are dropped so no figures of the previous
 * persona survive. DEMO ROLE SWITCH — NOT AUTHENTICATION.
 */
export async function switchAdminSession(
  services: Pick<AppServices, "session" | "repo" | "clock" | "ids" | "queryClient">,
  input: StartSessionInput,
): Promise<AdminSession> {
  const { session } = services.session.getState();
  if (session !== null) {
    try {
      await emitAdminAudit(services.repo, session, {
        action: "session.ended",
        changeSummary: { switchedTo: input.persona.id },
      });
    } catch {
      // The switch still happens; the failed audit write is retried by nobody (demo).
    }
  }
  services.queryClient.removeQueries({ queryKey: ["admin", "scoped"] });
  return startAdminSession(services, input);
}
