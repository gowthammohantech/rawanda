/**
 * `(app)` stack + SessionGuard (HWM-01 task 5): no tab or settings route renders without a
 * session (→ `/sign-in`); a revoked device → `/revoked`. `/denied` stays reachable signed out
 * (refused sign-in).
 */
import { Redirect, Stack, useSegments } from "expo-router";

import { sessionRedirect } from "../../src/session/sessionGuard.ts";
import { useSession } from "../../src/session/useSession.ts";

export default function AppLayout() {
  const { status } = useSession();
  const segments = useSegments() as readonly string[];
  const href = sessionRedirect(status, "app", { allowSignedOut: segments.includes("denied") });
  if (href !== null) return <Redirect href={href} />;
  return <Stack screenOptions={{ headerShown: false }} />;
}
