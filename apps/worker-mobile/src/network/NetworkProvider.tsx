/** Provides the network-mode store (created once per repository) and its hooks. */
import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { useStore } from "zustand";

import { useRepository } from "../providers.tsx";
import { createNetworkStore, type NetworkState, type NetworkStore } from "./networkStore.ts";

const NetworkContext = createContext<NetworkStore | null>(null);

export function NetworkProvider({ children }: { children?: ReactNode }) {
  const repo = useRepository();
  const [network] = useState(() => createNetworkStore(repo.demo));
  useEffect(() => {
    void network.load().catch(() => undefined);
  }, [network]);
  return <NetworkContext.Provider value={network}>{children}</NetworkContext.Provider>;
}

export function useNetworkStore(): NetworkStore {
  const value = useContext(NetworkContext);
  if (value === null) throw new Error("useNetworkStore must be used inside <NetworkProvider>");
  return value;
}

export type UseNetworkResult = NetworkState & {
  /** Simulated offline (FaultConfig `offline`). */
  offline: boolean;
  setFaults: NetworkStore["set"];
  reload: NetworkStore["load"];
};

export function useNetwork(): UseNetworkResult {
  const network = useNetworkStore();
  const state = useStore(network.store);
  return useMemo(
    () => ({
      ...state,
      offline: state.config.offline,
      setFaults: network.set,
      reload: network.load,
    }),
    [state, network],
  );
}
