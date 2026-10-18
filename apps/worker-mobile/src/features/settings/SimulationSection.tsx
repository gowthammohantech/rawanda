/**
 * Settings → CONNECTION + DEMO CONTROLS (HWM-10 task 1). CONNECTION mirrors the network store's
 * simulated offline switch (same FND-07 `FaultConfig.offline`, audited `demo.fault_toggled`)
 * and links to the full Network simulation. DEMO CONTROLS: Simulate device revocation (confirm
 * sheet → `useRevocation().revoke()` → `/revoked`), Activity log, Reset demo, FND demo tools.
 */
import {
  Button,
  ConfirmSheet,
  DemoToolsSheet,
  ListRow,
  Section,
  Toggle,
  useToast,
  useTx,
} from "@laif/ui-native";
import { useState } from "react";

import { ClockDriftNotice } from "../../components/ClockDriftNotice.tsx";
import { useDemoTools } from "../../demo-tools.tsx";
import { useNetwork } from "../../network/NetworkProvider.tsx";
import { useRevocation } from "../revocation/useRevocation.ts";

export type SimulationSectionProps = {
  onOpenNetwork: () => void;
  onOpenActivity: () => void;
  onOpenReset: () => void;
  /** After the simulated revocation (navigate to `/revoked`). */
  onRevoked: () => void;
};

export function SimulationSection({
  onOpenNetwork,
  onOpenActivity,
  onOpenReset,
  onRevoked,
}: SimulationSectionProps) {
  const t = useTx();
  const { toast } = useToast();
  const { offline, setFaults } = useNetwork();
  const { faults, setFault, reset, loadScenario, scenarios } = useDemoTools();
  const { revoke } = useRevocation();
  const [toolsOpen, setToolsOpen] = useState(false);
  const [revokeOpen, setRevokeOpen] = useState(false);
  const [revoking, setRevoking] = useState(false);

  const onRevoke = async () => {
    setRevoking(true);
    try {
      await revoke();
      setRevokeOpen(false);
      toast({ title: t("worker:revocation.revoked"), tone: "warning" });
      onRevoked();
    } catch {
      toast({ title: t("worker:settings.revokeFailed"), tone: "danger" });
    } finally {
      setRevoking(false);
    }
  };

  return (
    <>
      <Section title={t("worker:settings.connection")} testID="settings-connection">
        <Toggle
          testID="settings-offline"
          label={t("worker:settings.offlineSim")}
          description={t("worker:settings.offlineSimHint")}
          value={offline}
          onValueChange={(value) => {
            setFaults({ offline: value }).catch(() =>
              toast({ title: t("demo:tools.actionFailed"), tone: "danger" }),
            );
          }}
        />
        <ClockDriftNotice testID="settings-clock-drift" />
        <ListRow
          testID="open-network-simulation"
          icon="wifi-off"
          title={t("worker:settings.networkSimulation")}
          subtitle={t("worker:settings.networkSimulationHint")}
          onPress={onOpenNetwork}
        />
      </Section>
      <Section title={t("worker:settings.demoControls")} testID="settings-demo-controls">
        <ListRow
          testID="open-revoke-device"
          icon="lock"
          title={t("worker:settings.revokeDevice")}
          subtitle={t("worker:settings.revokeDeviceHint")}
          onPress={() => setRevokeOpen(true)}
        />
        <ListRow
          testID="open-activity-log"
          icon="activity"
          title={t("worker:settings.activityLog")}
          subtitle={t("worker:settings.activityLogHint")}
          onPress={onOpenActivity}
        />
        <ListRow
          testID="open-reset-demo"
          icon="refresh"
          title={t("worker:settings.resetDemo")}
          subtitle={t("worker:settings.resetDemoHint")}
          onPress={onOpenReset}
        />
        <Button variant="secondary" icon="settings" onPress={() => setToolsOpen(true)}>
          {t("demo:tools.open")}
        </Button>
      </Section>
      <ConfirmSheet
        testID="revoke-sheet"
        visible={revokeOpen}
        onClose={() => setRevokeOpen(false)}
        title={t("worker:settings.revokeTitle")}
        description={t("worker:settings.revokeDescription")}
        confirmLabel={t("worker:settings.revokeConfirm")}
        loading={revoking}
        onConfirm={onRevoke}
      />
      <DemoToolsSheet
        visible={toolsOpen}
        onClose={() => setToolsOpen(false)}
        onReset={reset}
        faults={faults}
        onFaultChange={setFault}
        scenarios={scenarios}
        onLoadScenario={(id) => void loadScenario(id)}
      />
    </>
  );
}
