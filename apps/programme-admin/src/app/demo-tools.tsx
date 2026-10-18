/**
 * Demo tools state (FND-11 task 5; ADM-09 task 3/4):
 * - the full FND-07 `FaultConfig` (`config`) — the topbar menu's three switches (Offline / Slow
 *   network / Server errors, mapped by `faultPatchForToggle`) and the Settings fault panel
 *   (`applyFaults`: latency, server error, timeout, offline, conflict on next write) drive the
 *   same config; updates are optimistic, so the OfflineBanner / FAULT SIMULATION pill appear in
 *   the same render;
 * - `reset()` — Reset demo (topbar menu and Settings): `repo.demo.resetDemo()` restores the
 *   baseline dataset, audit baseline (+ one `demo.reset`), settings, demo clock and fault
 *   defaults; then the TanStack cache, dialog drafts and the demo session are cleared (no
 *   `session.ended` — the audit log stays exactly baseline + `demo.reset`). Callers redirect to
 *   the sign-in. Returns false when the reset failed (a toast says so).
 * - `loadScenario(id)` — `SCENARIOS` for this app.
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
  useState,
  type ReactNode,
} from "react";

import { clearAllDrafts } from "../lib/drafts.ts";
import { APP_ID } from "./config.ts";
import { useRepository, useSessionStore } from "./providers.tsx";

export type DemoToolsValue = {
  /** The three topbar switches (derived from `config`). */
  faults: DemoFaultToggleState;
  /** The full fault config (defaults until loaded). */
  config: FaultConfig;
  /** True while any fault differs from the defaults (FAULT SIMULATION ON pill). */
  faultActive: boolean;
  setFault: (key: DemoFaultToggleKey, enabled: boolean) => void;
  /** Settings fault panel: applies a patch (optimistic; reverted on failure). */
  applyFaults: (patch: FaultConfigPatch) => Promise<void>;
  /** Reset demo; resolves true on success (caller redirects to the sign-in). */
  reset: () => Promise<boolean>;
  loadScenario: (scenarioId: string) => Promise<void>;
  scenarios: readonly DemoScenarioOption[];
  /** Bumped after a reset / scenario load so mounted screens remount and refetch. */
  epoch: number;
};

const APP_SCENARIOS = SCENARIOS.filter((scenario) => scenario.apps.includes(APP_ID));

/** Any simulated fault on (latency beyond the default range counts). */
export function isFaultActive(config: Readonly<FaultConfig>): boolean {
  return (
    config.offline ||
    config.serverErrorRate > 0 ||
    config.timeoutRate > 0 ||
    config.dependencyUnavailableRate > 0 ||
    config.deviceRevoked ||
    config.conflictOnce.length > 0 ||
    config.latencyMs[0] !== DEFAULT_FAULT_CONFIG.latencyMs[0] ||
    config.latencyMs[1] !== DEFAULT_FAULT_CONFIG.latencyMs[1]
  );
}

const DemoToolsContext = createContext<DemoToolsValue | null>(null);

export function DemoToolsProvider({ children }: { children?: ReactNode }) {
  const repo = useRepository();
  const session = useSessionStore();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const t = useTx();
  const [config, setConfig] = useState<FaultConfig>(() => normaliseFaultConfig({}));
  const [epoch, setEpoch] = useState(0);

  useEffect(() => {
    let active = true;
    void repo.demo.getFaults().then(
      (loaded) => {
        if (active) setConfig(loaded);
      },
      () => undefined,
    );
    return () => {
      active = false;
    };
  }, [repo]);

  // A write can consume a one-shot `conflictOnce` fault: re-read the config after each mutation,
  // so the FAULT SIMULATION pill and the panel follow.
  useEffect(
    () =>
      queryClient.getMutationCache().subscribe((event) => {
        if (event.type !== "updated" || event.action.type === "pending") return;
        if (event.action.type !== "success" && event.action.type !== "error") return;
        void repo.demo.getFaults().then(setConfig, () => undefined);
      }),
    [queryClient, repo],
  );

  const failed = useCallback(
    () => toast({ title: t("demo:tools.actionFailed"), tone: "danger" }),
    [toast, t],
  );

  const applyFaults = useCallback(
    async (patch: FaultConfigPatch) => {
      const previous = config;
      try {
        setConfig(normaliseFaultConfig(patch, previous));
      } catch {
        // An invalid patch is rejected by the repository below.
      }
      try {
        setConfig(await repo.demo.setFaults(patch));
        await queryClient.invalidateQueries();
      } catch {
        setConfig(previous);
        failed();
      }
    },
    [config, repo, queryClient, failed],
  );

  const setFault = useCallback(
    (key: DemoFaultToggleKey, enabled: boolean) => {
      void applyFaults(faultPatchForToggle(key, enabled));
    },
    [applyFaults],
  );

  const afterDatasetChange = useCallback(async () => {
    queryClient.clear();
    setConfig(await repo.demo.getFaults());
    setEpoch((value) => value + 1);
  }, [repo, queryClient]);

  const reset = useCallback(async () => {
    try {
      await repo.demo.resetDemo();
    } catch {
      failed();
      return false;
    }
    // The session's `session.started` belongs to the discarded audit history: sign out without
    // a new audit event, so the log is exactly the baseline + `demo.reset`.
    session.signOut();
    clearAllDrafts();
    await afterDatasetChange();
    toast({ title: t("admin:settings.reset.done"), tone: "positive" });
    return true;
  }, [repo, session, afterDatasetChange, toast, t, failed]);

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
    () => ({
      faults: faultTogglesFromConfig(config),
      config,
      faultActive: isFaultActive(config),
      setFault,
      applyFaults,
      reset,
      loadScenario,
      scenarios,
      epoch,
    }),
    [config, setFault, applyFaults, reset, loadScenario, scenarios, epoch],
  );
  return <DemoToolsContext.Provider value={value}>{children}</DemoToolsContext.Provider>;
}

export function useDemoTools(): DemoToolsValue {
  const value = useContext(DemoToolsContext);
  if (value === null) throw new Error("useDemoTools must be used inside <DemoToolsProvider>");
  return value;
}
