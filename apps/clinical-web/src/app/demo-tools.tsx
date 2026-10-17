/**
 * Demo tools state (FND-11 task 5, CLN-02): Reset demo, the fault simulation and Load scenario
 * (`SCENARIOS` for this app), shared by the topbar Demo tools menu, Settings and the
 * ConnectionBanner. The full FND-07 `FaultConfig` lives here (persisted by the repository in store
 * meta `demo.faults`); the menu's Offline / Slow network / Server errors switches are derived from
 * it (`faultTogglesFromConfig`). Changes apply optimistically, so the banner appears in the same
 * render. After a reset the query cache is cleared and the session is signed out if its persona /
 * facility is no longer valid.
 */
import { SCENARIOS } from "@laif/mock-data";
import {
  DEFAULT_FAULT_CONFIG,
  faultPatchForToggle,
  faultTogglesFromConfig,
  normaliseFaultConfig,
  type DemoFaultToggleKey,
  type DemoFaultToggleState,
  type FaultConfig,
  type FaultConfigPatch,
} from "@laif/repositories";
import { useToast, useTx, type DemoScenarioOption, type TranslationKey } from "@laif/ui-web";
import { useQueryClient } from "@tanstack/react-query";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";

import { useRepository } from "../data/useRepository.ts";
import { useSessionStore } from "../session/useSession.ts";
import { APP_ID } from "./config.ts";

export type DemoToolsValue = {
  /** Topbar menu switches, derived from `faultConfig`. */
  faults: DemoFaultToggleState;
  /** The full FND-07 fault configuration (Settings › Fault simulation). */
  faultConfig: FaultConfig;
  /** False until the persisted fault config was read from the repository. */
  faultsReady: boolean;
  setFault: (key: DemoFaultToggleKey, enabled: boolean) => void;
  /** Applies a `FaultConfig` patch (optimistic; reverted with a toast on failure). */
  applyFaults: (patch: FaultConfigPatch) => Promise<boolean>;
  /**
   * Resolves true on success; failures show a toast (or throw with `{ rethrow: true }`).
   * `{ silent: true }` skips the success toast (the caller shows its own).
   */
  reset: (options?: { rethrow?: boolean; silent?: boolean }) => Promise<boolean>;
  loadScenario: (scenarioId: string) => Promise<void>;
  scenarios: readonly DemoScenarioOption[];
  /** Bumped after a reset / scenario load so mounted screens remount and refetch. */
  epoch: number;
};

const DEFAULTS: FaultConfig = normaliseFaultConfig({}, DEFAULT_FAULT_CONFIG);
const APP_SCENARIOS = SCENARIOS.filter((scenario) => scenario.apps.includes(APP_ID));

const DemoToolsContext = createContext<DemoToolsValue | null>(null);

export function DemoToolsProvider({ children }: { children?: ReactNode }) {
  const repo = useRepository();
  const session = useSessionStore();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const t = useTx();
  const [faultConfig, setFaultConfigState] = useState<FaultConfig>(DEFAULTS);
  const configRef = useRef<FaultConfig>(DEFAULTS);
  const setFaultConfig = useCallback((config: FaultConfig) => {
    configRef.current = config;
    setFaultConfigState(config);
  }, []);
  const [epoch, setEpoch] = useState(0);
  const [faultsReady, setFaultsReady] = useState(false);

  useEffect(() => {
    let active = true;
    void repo.demo.getFaults().then(
      (config) => {
        if (!active) return;
        setFaultConfig(config);
        setFaultsReady(true);
      },
      () => {
        if (active) setFaultsReady(true);
      },
    );
    return () => {
      active = false;
    };
  }, [repo, setFaultConfig]);

  const failed = useCallback(
    () => toast({ title: t("demo:tools.actionFailed"), tone: "danger" }),
    [toast, t],
  );

  const applyFaults = useCallback(
    async (patch: FaultConfigPatch) => {
      const previous = configRef.current;
      try {
        setFaultConfig(normaliseFaultConfig(patch, previous));
      } catch {
        // Invalid patch: the repository rejects it below and the previous config stays.
      }
      try {
        const config = await repo.demo.setFaults(patch);
        setFaultConfig(config);
        // Healthy screens refetch under the new faults; screens already showing an ErrorState
        // keep it until the presenter presses "Try again" (FRD: explicit retry).
        void queryClient.invalidateQueries({
          predicate: (query) => query.state.status !== "error",
        });
        return true;
      } catch {
        setFaultConfig(previous);
        failed();
        return false;
      }
    },
    [repo, queryClient, failed, setFaultConfig],
  );

  const setFault = useCallback(
    (key: DemoFaultToggleKey, enabled: boolean) => {
      void applyFaults(faultPatchForToggle(key, enabled));
    },
    [applyFaults],
  );

  const afterDatasetChange = useCallback(async () => {
    queryClient.clear();
    setFaultConfig(await repo.demo.getFaults());
    // Personas / facilities are reference data, but never keep a session the reset invalidated.
    if (session.state() === null) session.signOut();
    setEpoch((value) => value + 1);
  }, [repo, queryClient, session, setFaultConfig]);

  const reset = useCallback(
    async (options: { rethrow?: boolean; silent?: boolean } = {}) => {
      try {
        await repo.demo.resetDemo();
      } catch (error) {
        if (options.rethrow === true) throw error;
        failed();
        return false;
      }
      await afterDatasetChange();
      if (options.silent !== true) toast({ title: t("demo:tools.resetDone") });
      return true;
    },
    [repo, afterDatasetChange, toast, t, failed],
  );

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

  const faults = useMemo(() => faultTogglesFromConfig(faultConfig), [faultConfig]);
  const value = useMemo(
    () => ({
      faults,
      faultConfig,
      faultsReady,
      setFault,
      applyFaults,
      reset,
      loadScenario,
      scenarios,
      epoch,
    }),
    [
      faults,
      faultConfig,
      faultsReady,
      setFault,
      applyFaults,
      reset,
      loadScenario,
      scenarios,
      epoch,
    ],
  );
  return <DemoToolsContext.Provider value={value}>{children}</DemoToolsContext.Provider>;
}

export function useDemoTools(): DemoToolsValue {
  const value = useContext(DemoToolsContext);
  if (value === null) throw new Error("useDemoTools must be used inside <DemoToolsProvider>");
  return value;
}
