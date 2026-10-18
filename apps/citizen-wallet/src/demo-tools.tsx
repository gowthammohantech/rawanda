/**
 * Demo tools state (FND-11 task 5): Reset demo, Offline / Slow network / Server errors (mapped
 * onto the FND-07 `FaultConfig` by `faultPatchForToggle`) and Load scenario (`SCENARIOS` for
 * this app). Switches update optimistically, so the OfflineBanner appears in the same render.
 * CTZ-08: Reset demo also restores the baseline display preferences — language `en`, standard
 * text size, high contrast off (the seeded `ctz_settings` rows are reset by `resetDemo`).
 */
import { DEFAULT_LANGUAGE, useLanguage } from "@laif/i18n";
import { SCENARIOS } from "@laif/mock-data";
import {
  faultPatchForToggle,
  faultTogglesFromConfig,
  type DemoFaultToggleKey,
  type DemoFaultToggleState,
} from "@laif/repositories";
import { useToast, useTx, type DemoScenarioOption, type TranslationKey } from "@laif/ui-native";
import { useQueryClient } from "@tanstack/react-query";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";

import { APP_ID } from "./config.ts";
import { useCitizenRepo } from "./data/repo.tsx";
import { useDisplayStore } from "./theme/ThemeProvider.tsx";

export type DemoToolsValue = {
  faults: DemoFaultToggleState;
  setFault: (key: DemoFaultToggleKey, enabled: boolean) => void;
  reset: () => Promise<void>;
  loadScenario: (scenarioId: string) => Promise<void>;
  scenarios: readonly DemoScenarioOption[];
  /** Bumped after a reset / scenario load so mounted screens remount and refetch. */
  epoch: number;
};

const ALL_OFF: DemoFaultToggleState = { offline: false, slow: false, errors: false };
const APP_SCENARIOS = SCENARIOS.filter((scenario) => scenario.apps.includes(APP_ID));

const DemoToolsContext = createContext<DemoToolsValue | null>(null);

export function DemoToolsProvider({ children }: { children?: ReactNode }) {
  const repo = useCitizenRepo();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const t = useTx();
  const { setLanguage } = useLanguage();
  const display = useDisplayStore();
  const [faults, setFaults] = useState<DemoFaultToggleState>(ALL_OFF);
  const [epoch, setEpoch] = useState(0);

  useEffect(() => {
    let active = true;
    void repo.demo.getFaults().then(
      (config) => {
        if (active) setFaults(faultTogglesFromConfig(config));
      },
      () => undefined,
    );
    return () => {
      active = false;
    };
  }, [repo]);

  const failed = useCallback(
    () => toast({ title: t("demo:tools.actionFailed"), tone: "danger" }),
    [toast, t],
  );

  const setFault = useCallback(
    (key: DemoFaultToggleKey, enabled: boolean) => {
      setFaults((previous) => ({ ...previous, [key]: enabled }));
      repo.demo.setFaults(faultPatchForToggle(key, enabled)).then(
        (config) => {
          setFaults(faultTogglesFromConfig(config));
          void queryClient.invalidateQueries();
        },
        () => {
          setFaults((previous) => ({ ...previous, [key]: !enabled }));
          failed();
        },
      );
    },
    [repo, queryClient, failed],
  );

  const afterDatasetChange = useCallback(async () => {
    queryClient.clear();
    setFaults(faultTogglesFromConfig(await repo.demo.getFaults()));
    setEpoch((value) => value + 1);
  }, [repo, queryClient]);

  const reset = useCallback(async () => {
    try {
      await repo.demo.resetDemo();
      display.getState().reset();
      await setLanguage(DEFAULT_LANGUAGE);
      await afterDatasetChange();
      toast({ title: t("demo:tools.resetDone") });
    } catch {
      failed();
    }
  }, [repo, afterDatasetChange, toast, t, failed, display, setLanguage]);

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
