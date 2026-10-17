import { useRouter } from "expo-router";

import { NetworkSimulationScreen } from "../../../src/features/settings/NetworkSimulationScreen.tsx";

export default function NetworkSimulationRoute() {
  const router = useRouter();
  return (
    <NetworkSimulationScreen
      onBack={() => (router.canGoBack() ? router.back() : router.replace("/settings"))}
    />
  );
}
