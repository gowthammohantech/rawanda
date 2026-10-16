import { useLocalSearchParams, useRouter } from "expo-router";

import { ScopeScreen } from "../../src/features/auth/ScopeScreen.tsx";

/** The persona id param only says which profile was picked; the scope comes from the session. */
export default function ScopeRoute() {
  const router = useRouter();
  const { personaId } = useLocalSearchParams<{ personaId?: string }>();
  return (
    <ScopeScreen
      personaId={personaId}
      onBack={() => (router.canGoBack() ? router.back() : router.replace("/sign-in"))}
      onSignedIn={() => router.replace("/")}
      onDenied={() => router.replace("/denied")}
    />
  );
}
