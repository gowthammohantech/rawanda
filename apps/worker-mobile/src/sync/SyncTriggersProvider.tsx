/**
 * Mounts the HWM-09 sync triggers (`triggers.ts`) for the signed-in device session:
 * AppState → `active` (`foreground`), the network store's simulated offline → online
 * (`online`), committed local writes (`useSyncTriggers().afterWrite()`), resolutions and the
 * retry timer. Nothing runs while signed out (no actor: the server would refuse the ops) or
 * while the simulated network is offline. Every run refreshes the worker queries.
 */
import { useQueryClient } from "@tanstack/react-query";
import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  useSyncExternalStore,
  type ReactNode,
} from "react";
import { AppState } from "react-native";

import { invalidateAfterWrite } from "../data/queryKeys.ts";
import { useNetworkStore } from "../network/NetworkProvider.tsx";
import { useRepository } from "../providers.tsx";
import { useSession } from "../session/useSession.ts";
import { nextRetryDelayMs } from "./scheduler.ts";
import { createSyncTriggers, type AutoSyncTrigger, type SyncTriggers } from "./triggers.ts";

export type SyncTriggersApi = SyncTriggers & {
  /** After a committed local write (debounced `after_write`). */
  afterWrite: () => void;
};

/** A boolean read by callbacks outside render (signed in?). */
function createGate(initial: boolean) {
  let value = initial;
  return {
    get: () => value,
    set: (next: boolean) => {
      value = next;
    },
  };
}

const SyncTriggersContext = createContext<SyncTriggersApi | null>(null);

export function SyncTriggersProvider({ children }: { children?: ReactNode }) {
  const repo = useRepository();
  const network = useNetworkStore();
  const queryClient = useQueryClient();
  const { status } = useSession();
  // Read by the trigger callbacks (outside render); kept current by the effect below.
  const [gate] = useState(() => createGate(status === "signed_in"));

  const [triggers] = useState<SyncTriggersApi>(() => {
    const core = createSyncTriggers({
      process: (trigger) => repo.sync.process({ trigger }),
      isOffline: () => !gate.get() || network.store.getState().config.offline,
      nextRetryDelayMs: async () => {
        const [ops, demo] = await Promise.all([
          repo.sync.list({ statuses: ["retryable_failure"] }),
          repo.demo.getDemoState(),
        ]);
        return nextRetryDelayMs(ops, Date.parse(demo.clockIso));
      },
      onSettled: () => void invalidateAfterWrite(queryClient),
    });
    return { ...core, afterWrite: () => core.request("after_write") };
  });

  useEffect(() => () => triggers.dispose(), [triggers]);

  // Simulated network offline → online.
  useEffect(
    () =>
      network.store.subscribe((state, previous) => {
        if (previous.config.offline && !state.config.offline) triggers.request("online");
      }),
    [network, triggers],
  );

  // App back in the foreground.
  useEffect(() => {
    let last: string | null | undefined = AppState.currentState;
    const subscription = AppState.addEventListener("change", (next) => {
      if (next === "active" && last !== "active") triggers.request("foreground");
      last = next;
    });
    return () => subscription.remove();
  }, [triggers]);

  // Signed in (again): pick up retries that are already scheduled.
  useEffect(() => {
    gate.set(status === "signed_in");
    if (gate.get()) void triggers.reschedule();
  }, [status, triggers, gate]);

  return <SyncTriggersContext.Provider value={triggers}>{children}</SyncTriggersContext.Provider>;
}

export function useSyncTriggers(): SyncTriggersApi {
  const value = useContext(SyncTriggersContext);
  if (value === null) throw new Error("useSyncTriggers must be used inside <SyncTriggersProvider>");
  return value;
}

/** True while a run started through the triggers (Sync now, automatic) is in flight. */
export function useSyncRunning(): boolean {
  const triggers = useSyncTriggers();
  const subscribe = useMemo(
    () => (onChange: () => void) => triggers.subscribe(() => onChange()),
    [triggers],
  );
  return useSyncExternalStore(subscribe, triggers.isRunning, triggers.isRunning);
}

export type { AutoSyncTrigger };
