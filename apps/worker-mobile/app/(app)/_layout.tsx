/**
 * `(app)` stack + SessionGuard (HWM-01 task 5): no tab or settings route renders without a
 * session (→ `/sign-in`); a revoked device → `/revoked` (HWM-10: also when a sync run meets
 * `DEVICE_REVOKED`, via `useRevocationWatcher`). `/denied` stays reachable signed out (refused
 * sign-in).
 */
import { Redirect, Stack, useSegments } from "expo-router";

import { useRevocationWatcher } from "../../src/features/revocation/useRevocation.ts";
import { sessionRedirect } from "../../src/session/sessionGuard.ts";
import { useSession } from "../../src/session/useSession.ts";

export default function AppLayout() {
  const { status } = useSession();
  const segments = useSegments() as readonly string[];
  useRevocationWatcher();
  const href = sessionRedirect(status, "app", { allowSignedOut: segments.includes("denied") });
  if (href !== null) return <Redirect href={href} />;
  return <Stack screenOptions={{ headerShown: false }} />;
}
