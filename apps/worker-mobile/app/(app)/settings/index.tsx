import { useRouter } from "expo-router";

import { SettingsScreen } from "../../../src/features/settings/SettingsScreen.tsx";

export default function SettingsRoute() {
  const router = useRouter();
  return (
    <SettingsScreen
      onBack={() => (router.canGoBack() ? router.back() : router.replace("/"))}
      onSignedOut={() => router.replace("/sign-in")}
    />
  );
}
