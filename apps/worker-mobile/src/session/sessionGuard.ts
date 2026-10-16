/**
 * Pure redirect decision of the session guards (HWM-01 task 5). Unit-tested; the Expo Router
 * layouts render `<Redirect href={...} />` from it.
 */
import type { SessionStatus } from "./sessionRepo.ts";

export const SIGN_IN_HREF = "/sign-in" as const;
export const REVOKED_HREF = "/revoked" as const;
export const TABS_HREF = "/" as const;

export type GuardArea = "app" | "auth" | "entry";

/**
 * - `app` (tabs, settings): signed out → sign-in; revoked → `/revoked`; signed in → stay.
 *   `allowSignedOut` routes (the `/denied` screen after a refused sign-in) stay without a session.
 * - `auth` (sign-in, scope): signed in → tabs; revoked → `/revoked`; signed out → stay.
 * - `entry` (`/` before routing): always resolves to one destination.
 * Returns null = render the route (also while `loading`: the SessionProvider shows the splash).
 */
export function sessionRedirect(
  status: SessionStatus,
  area: GuardArea,
  options: { allowSignedOut?: boolean } = {},
): typeof SIGN_IN_HREF | typeof REVOKED_HREF | typeof TABS_HREF | null {
  if (status === "loading") return null;
  if (status === "revoked") return REVOKED_HREF;
  if (area === "auth") return status === "signed_in" ? TABS_HREF : null;
  if (status === "signed_out") return options.allowSignedOut === true ? null : SIGN_IN_HREF;
  return area === "entry" ? TABS_HREF : null;
}
