import { useRouter } from "expo-router";

import { SignInScreen } from "../../src/features/auth/SignInScreen.tsx";

export default function SignInRoute() {
  const router = useRouter();
  return (
    <SignInScreen
      onPersonaChosen={(personaId) => router.push({ pathname: "/scope", params: { personaId } })}
    />
  );
}
