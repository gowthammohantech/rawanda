import { useRouter } from "expo-router";

import { ResetDemoScreen } from "../../../src/features/settings/ResetDemoScreen.tsx";

export default function ResetDemoRoute() {
  const router = useRouter();
  return (
    <ResetDemoScreen
      onBack={() => (router.canGoBack() ? router.back() : router.replace("/settings"))}
      onDone={() => router.replace("/sign-in")}
    />
  );
}
