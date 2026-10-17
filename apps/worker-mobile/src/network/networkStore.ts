/**
 * Network-mode store (HWM-02 task 4): a Zustand view of the FND-07 `FaultConfig`. The config is
 * owned and persisted by the repository (store meta `demo.faults`); this store only mirrors it
 * for the UI (header badge, offline strip, Network simulation, Demo tools). Writes go through
 * `repo.demo.setFaults` (audited `demo.fault_toggled`) — optimistic, reverted on failure.
 */
import {
  DEFAULT_FAULT_CONFIG,
  normaliseFaultConfig,
  type DemoApi,
  type FaultConfig,
  type FaultConfigPatch,
} from "@laif/repositories";
import { createStore, type StoreApi } from "zustand/vanilla";

export type NetworkState = {
  config: FaultConfig;
  /** True once the persisted config has been read. */
  loaded: boolean;
};

export type NetworkStore = {
  store: StoreApi<NetworkState>;
  /** Re-reads the persisted config (startup, after a demo reset / scenario load). */
  load: () => Promise<FaultConfig>;
  /** Applies a patch (clamped by FND `normaliseFaultConfig`) and persists it. */
  set: (patch: FaultConfigPatch) => Promise<FaultConfig>;
};

export function createNetworkStore(demo: Pick<DemoApi, "getFaults" | "setFaults">): NetworkStore {
  const store = createStore<NetworkState>(() => ({
    config: normaliseFaultConfig({}, DEFAULT_FAULT_CONFIG),
    loaded: false,
  }));
  let writes = 0;

  return {
    store,
    load: async () => {
      const config = await demo.getFaults();
      store.setState({ config, loaded: true });
      return config;
    },
    set: async (patch) => {
      const previous = store.getState().config;
      const write = ++writes;
      try {
        store.setState({ config: normaliseFaultConfig(patch, previous) });
      } catch {
        // Invalid patch (e.g. unknown conflictOnce entity): let the repository reject it.
      }
      try {
        const config = await demo.setFaults(patch);
        if (write === writes) store.setState({ config, loaded: true });
        return config;
      } catch (error) {
        if (write === writes) store.setState({ config: previous });
        throw error;
      }
    },
  };
}
