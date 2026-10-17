import { useLocalSearchParams, useRouter } from "expo-router";

import { DeniedScreen } from "../../src/features/auth/DeniedScreen.tsx";
import { useSession } from "../../src/session/useSession.ts";

export default function DeniedRoute() {
  const router = useRouter();
  const { session } = useSession();
  const { reason } = useLocalSearchParams<{ reason?: string }>();
  return (
    <DeniedScreen
      reason={reason === "patient" || reason === "task" ? reason : "facility"}
      onBack={() =>
        session === null
          ? router.replace("/sign-in")
          : router.canGoBack()
            ? router.back()
            : router.replace("/")
      }
    />
  );
}
