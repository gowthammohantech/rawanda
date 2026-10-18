import { useRouter } from "expo-router";

import { ActivityLogScreen } from "../../../src/features/settings/ActivityLogScreen.tsx";

export default function ActivityLogRoute() {
  const router = useRouter();
  return (
    <ActivityLogScreen
      onBack={() => (router.canGoBack() ? router.back() : router.replace("/settings"))}
    />
  );
}
