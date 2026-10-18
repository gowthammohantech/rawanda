/**
 * Demo tools state (FND-11 task 5): Reset demo, Offline / Slow network / Server errors (mapped
 * onto the FND-07 `FaultConfig` by `faultPatchForToggle`) and Load scenario (`SCENARIOS` for
 * this app). Switches update optimistically, so the OfflineBanner appears in the same render.
 * HWM-02: the fault state lives in the network-mode store (one view shared with the header badge
 * and the Network simulation screen).
 * HWM-10: `reset` runs `demo/reset.ts` (reseed + sign out + new device id + device clock cleared,
 * language kept) and toasts "Demo data restored".
 */
import { SCENARIOS } from "@laif/mock-data";
import {
  faultPatchForToggle,
  faultTogglesFromConfig,
  type DemoFaultToggleKey,
  type DemoFaultToggleState,
} from "@laif/repositories";
import { useToast, useTx, type DemoScenarioOption, type TranslationKey } from "@laif/ui-native";
import { useQueryClient } from "@tanstack/react-query";
import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from "react";

import { APP_ID } from "./config.ts";
import { invalidateAfterWrite } from "./data/queryKeys.ts";
import { useNetwork } from "./network/NetworkProvider.tsx";
import { resetDemoBaseline } from "./demo/reset.ts";
import { useDeviceClockStore, useRepository, useSessionStore } from "./providers.tsx";

export type DemoToolsValue = {
  faults: DemoFaultToggleState;
  setFault: (key: DemoFaultToggleKey, enabled: boolean) => void;
  /** Resolves `true` once the baseline is restored (`false` after a failure toast). */
  reset: () => Promise<boolean>;
  loadScenario: (scenarioId: string) => Promise<void>;
  scenarios: readonly DemoScenarioOption[];
  /** Bumped after a reset / scenario load so mounted screens remount and refetch. */
  epoch: number;
};

const APP_SCENARIOS = SCENARIOS.filter((scenario) => scenario.apps.includes(APP_ID));

const DemoToolsContext = createContext<DemoToolsValue | null>(null);

export function DemoToolsProvider({ children }: { children?: ReactNode }) {
  const repo = useRepository();
  const session = useSessionStore();
  const deviceClock = useDeviceClockStore();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const t = useTx();
  const network = useNetwork();
  const faults = useMemo(() => faultTogglesFromConfig(network.config), [network.config]);
  const { setFaults, reload } = network;
  const [epoch, setEpoch] = useState(0);

  const failed = useCallback(
    () => toast({ title: t("demo:tools.actionFailed"), tone: "danger" }),
    [toast, t],
  );

  const setFault = useCallback(
    (key: DemoFaultToggleKey, enabled: boolean) => {
      setFaults(faultPatchForToggle(key, enabled)).then(
        () => void invalidateAfterWrite(queryClient),
        failed,
      );
    },
    [setFaults, queryClient, failed],
  );

  const afterDatasetChange = useCallback(async () => {
    queryClient.clear();
    await reload();
    setEpoch((value) => value + 1);
  }, [reload, queryClient]);

  const reset = useCallback(async () => {
    try {
      await resetDemoBaseline({ repo, session, deviceClock });
      await afterDatasetChange();
      toast({ title: t("worker:settings.reset.done") });
      return true;
    } catch {
      failed();
      return false;
    }
  }, [repo, session, deviceClock, afterDatasetChange, toast, t, failed]);

  const scenarios = useMemo(
    () =>
      APP_SCENARIOS.map((scenario) => ({
        id: scenario.id,
        title: t(scenario.titleKey as TranslationKey),
      })),
    [t],
  );

  const loadScenario = useCallback(
    async (scenarioId: string) => {
      try {
        await repo.demo.loadScenario(scenarioId);
        await afterDatasetChange();
        const title = scenarios.find((scenario) => scenario.id === scenarioId)?.title ?? scenarioId;
        toast({ title: t("demo:tools.scenarioLoaded", { title }) });
      } catch {
        failed();
      }
    },
    [repo, afterDatasetChange, scenarios, toast, t, failed],
  );

  const value = useMemo(
    () => ({ faults, setFault, reset, loadScenario, scenarios, epoch }),
    [faults, setFault, reset, loadScenario, scenarios, epoch],
  );
  return <DemoToolsContext.Provider value={value}>{children}</DemoToolsContext.Provider>;
}

export function useDemoTools(): DemoToolsValue {
  const value = useContext(DemoToolsContext);
  if (value === null) throw new Error("useDemoTools must be used inside <DemoToolsProvider>");
  return value;
}
