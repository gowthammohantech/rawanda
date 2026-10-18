/**
 * `/revoked` (HWM-10): outside the `(app)` group, so no tab or patient screen is mounted. Only a
 * revoked device session stays here; signed in again (restored) → tabs, signed out → sign-in.
 */
import { Redirect, useRouter } from "expo-router";

import { RevokedDeviceScreen } from "../src/features/revocation/RevokedDeviceScreen.tsx";
import { SIGN_IN_HREF, TABS_HREF } from "../src/session/sessionGuard.ts";
import { useSession } from "../src/session/useSession.ts";

export default function RevokedRoute() {
  const router = useRouter();
  const { status } = useSession();
  if (status === "signed_out") return <Redirect href={SIGN_IN_HREF} />;
  if (status === "signed_in") return <Redirect href={TABS_HREF} />;
  return <RevokedDeviceScreen onRestored={() => router.replace(TABS_HREF)} />;
}
