/** `(auth)` stack (no tabs): sign-in and scope. Signed in → tabs; revoked → `/revoked`. */
import { Redirect, Stack } from "expo-router";

import { sessionRedirect } from "../../src/session/sessionGuard.ts";
import { useSession } from "../../src/session/useSession.ts";

export default function AuthLayout() {
  const { status } = useSession();
  const href = sessionRedirect(status, "auth");
  if (href !== null) return <Redirect href={href} />;
  return <Stack screenOptions={{ headerShown: false }} />;
}
