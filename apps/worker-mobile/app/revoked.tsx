import { useRouter } from "expo-router";

import { RevokedScreen } from "../src/features/auth/RevokedScreen.tsx";
import { useSession } from "../src/session/useSession.ts";

/** Revoked device (HWM-10 completes it). Leaving signs out locally; unsynced work stays. */
export default function RevokedRoute() {
  const router = useRouter();
  const { signOut } = useSession();
  return (
    <RevokedScreen
      onSignIn={() => {
        void signOut().then(() => router.replace("/sign-in"));
      }}
    />
  );
}
