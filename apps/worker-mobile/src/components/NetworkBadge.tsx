/** Header network badge. Static "Online" until HWM-02 wires the simulated network store. */
import { StatusChip, useTx } from "@laif/ui-native";
import { View } from "react-native";

export function NetworkBadge() {
  const t = useTx();
  const status = t("worker:nav.online");
  return (
    <View
      testID="network-badge"
      accessible
      accessibilityLabel={t("worker:nav.networkStatus", { status })}
    >
      <StatusChip tone="positive" icon="dot">
        {status}
      </StatusChip>
    </View>
  );
}
