/**
 * Header network badge (HWM-02): "Online" / "Offline (simulated)" from the network-mode store
 * (FND-07 `FaultConfig.offline`). Icon + text, never colour only.
 */
import { StatusChip, useTx } from "@laif/ui-native";
import { View } from "react-native";

import { useNetwork } from "../network/NetworkProvider.tsx";

export function NetworkBadge() {
  const t = useTx();
  const { offline } = useNetwork();
  const status = offline ? t("worker:sync.badge.offline") : t("worker:sync.badge.online");
  return (
    <View
      testID="network-badge"
      accessible
      accessibilityLabel={t("worker:nav.networkStatus", { status })}
    >
      <StatusChip tone={offline ? "warning" : "positive"} icon={offline ? "wifi-off" : "dot"}>
        {status}
      </StatusChip>
    </View>
  );
}
