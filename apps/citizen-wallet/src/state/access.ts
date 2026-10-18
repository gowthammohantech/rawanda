/**
 * Pure wallet routing decisions (CTZ-02 tasks 7, 12). Unit-tested; the Expo Router layouts
 * render `<Redirect href={...} />` from them. Health routes need: a signed-in persona, a
 * verified (active) account, a linked patient and consent `granted`.
 */
import type { ConsentState } from "@laif/domain";
import type { CitizenSession } from "@laif/repositories/citizen";

import type { WalletTab } from "./session.ts";

export const HREFS = {
  welcome: "/welcome",
  persona: "/persona",
  verify: "/verify",
  recover: "/recover",
  consent: "/consent",
  withdrawn: "/consent-withdrawn",
} as const;

export type GateHref = (typeof HREFS)[keyof typeof HREFS] | `/${WalletTab}`;

/** Where a session must go BEFORE consent is known (null = consent decides). */
export function accountGate(session: CitizenSession | null): GateHref | null {
  if (session === null) return HREFS.persona;
  const status = session.account?.status ?? null;
  if (status === null) return HREFS.persona;
  if (status === "pending_verification") return HREFS.verify;
  if (status === "locked") return HREFS.recover;
  if (session.activePatientId === null) return HREFS.consent;
  return null;
}

/** Where a persona lands after choosing it / relaunching (consent known). */
export function landingHref(
  session: CitizenSession | null,
  consent: ConsentState | null,
  lastTab: WalletTab = "health",
): GateHref {
  const gate = accountGate(session);
  if (gate !== null) return gate;
  if (consent === "granted") return `/${lastTab}`;
  if (consent === "withdrawn") return HREFS.withdrawn;
  return HREFS.consent;
}

/**
 * CTZ-08 task 11: `(app)` routes reachable WITHOUT consent — language, text size and help are
 * needed to decide on consent. None of them queries health data. `more/support` covers its
 * children (callback, help); the callback itself is disabled without consent.
 */
export const CONSENT_FREE_ROUTES = [
  "more/accessibility",
  "more/support",
  "more/consent",
  "more/demo-tools",
] as const;

/** Expo Router segments → route path without groups (`(app)/(tabs)/more/x` → `more/x`). */
export function routePathOf(segments: readonly string[]): string {
  return segments.filter((s) => !(s.startsWith("(") && s.endsWith(")"))).join("/");
}

export function isConsentFreeRoute(segments: readonly string[]): boolean {
  const path = routePathOf(segments);
  return CONSENT_FREE_ROUTES.some(
    (route) => path === route || (route === "more/support" && path.startsWith(`${route}/`)),
  );
}

/**
 * `(app)` guard: null = render the route. `onWithdrawnScreen` = the consent-withdrawn screen
 * itself (reachable while consent is not granted); `consentFree` = a CTZ-08 consent-free route
 * (still needs a verified account with a linked record).
 */
export function appGuardHref(
  session: CitizenSession | null,
  consent: ConsentState | null,
  onWithdrawnScreen: boolean,
  consentFree = false,
): GateHref | null {
  const gate = accountGate(session);
  if (gate !== null) return gate;
  if (consent === "granted") return onWithdrawnScreen ? "/health" : null;
  if (consentFree) return null;
  if (consent === "withdrawn") return onWithdrawnScreen ? null : HREFS.withdrawn;
  return HREFS.consent;
}
