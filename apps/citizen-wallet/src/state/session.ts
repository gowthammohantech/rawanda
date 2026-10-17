/**
 * Wallet session view (CTZ-02): a Zustand store over the FND-06 persona session
 * (`createPersonaSession({ appId: 'citizen' })`, key `laif.citizen.persona`). It adds the
 * wallet context of the signed-in persona — `{ accountId, personaId, activePatientId }` — and
 * the last tab, persisted under `laif.citizen.wallet` in the same synchronous key/value storage
 * (`expo-sqlite/kv-store` on device, localStorage on the web target). Never stores health data.
 *
 * DEMO PERSONA — role switching is not real sign-in.
 */
import type { KeyValueStorage } from "@laif/auth-demo";
import { createStore, type StoreApi } from "zustand/vanilla";

import type { AppSession } from "../session.ts";

export const WALLET_STORAGE_KEY = "laif.citizen.wallet" as const;

export const WALLET_TABS = ["health", "next-steps", "reminders", "timeline", "more"] as const;
export type WalletTab = (typeof WALLET_TABS)[number];

/** CTZ-06 Timeline filter (session-only: kept while switching tabs, never persisted). */
export const TIMELINE_FILTER_VALUES = ["all", "waiting", "done", "changes"] as const;
export type TimelineFilterValue = (typeof TIMELINE_FILTER_VALUES)[number];

export type WalletContext = {
  accountId: string | null;
  personaId: string | null;
  activePatientId: string | null;
};

export type WalletState = WalletContext & {
  lastTab: WalletTab;
  /** Personas whose `session.started` was recorded in this app run (not persisted). */
  startedFor: string | null;
  /** CTZ-06 Timeline filter chip (in memory for this app run; reset on persona change). */
  timelineFilter: TimelineFilterValue;
  setTimelineFilter: (filter: TimelineFilterValue) => void;
  setContext: (context: Omit<WalletContext, "personaId">) => void;
  setLastTab: (tab: WalletTab) => void;
  markStarted: (personaId: string) => void;
  /** Clears the wallet context (persona switch / sign out); keeps nothing of the persona. */
  clear: () => void;
};

export type WalletStore = StoreApi<WalletState>;

type Persisted = { accountId: string | null; activePatientId: string | null; lastTab: WalletTab };

const isTab = (value: unknown): value is WalletTab =>
  typeof value === "string" && (WALLET_TABS as readonly string[]).includes(value);

function read(storage: KeyValueStorage): Persisted & { personaId: string | null } {
  const empty = { accountId: null, activePatientId: null, lastTab: "health" as WalletTab };
  try {
    const raw = storage.getItem(WALLET_STORAGE_KEY);
    if (raw === null) return { ...empty, personaId: null };
    const value = JSON.parse(raw) as Partial<Persisted & { personaId: string }>;
    return {
      personaId: typeof value.personaId === "string" ? value.personaId : null,
      accountId: typeof value.accountId === "string" ? value.accountId : null,
      activePatientId: typeof value.activePatientId === "string" ? value.activePatientId : null,
      lastTab: isTab(value.lastTab) ? value.lastTab : "health",
    };
  } catch {
    return { ...empty, personaId: null };
  }
}

export function createWalletStore(session: AppSession, storage: KeyValueStorage): WalletStore {
  const stored = read(storage);
  const currentId = session.current()?.id ?? null;
  // A stored context only belongs to the persona it was written for.
  const initial =
    stored.personaId !== null && stored.personaId === currentId
      ? stored
      : { personaId: currentId, accountId: null, activePatientId: null, lastTab: stored.lastTab };

  const store = createStore<WalletState>()((set) => ({
    ...initial,
    startedFor: null,
    timelineFilter: "all",
    setTimelineFilter: (filter) => set({ timelineFilter: filter }),
    setContext: (context) => set(context),
    setLastTab: (tab) => set({ lastTab: tab }),
    markStarted: (personaId) => set({ startedFor: personaId }),
    clear: () =>
      set({
        accountId: null,
        activePatientId: null,
        lastTab: "health",
        startedFor: null,
        timelineFilter: "all",
      }),
  }));

  // The persona itself is owned by the FND-06 session; mirror it here.
  session.subscribe((persona) => {
    const personaId = persona?.id ?? null;
    if (personaId === store.getState().personaId) return;
    store.setState({
      personaId,
      accountId: null,
      activePatientId: null,
      lastTab: "health",
      startedFor: null,
      timelineFilter: "all",
    });
  });

  store.subscribe((state) => {
    try {
      if (state.personaId === null) {
        storage.removeItem(WALLET_STORAGE_KEY);
        return;
      }
      storage.setItem(
        WALLET_STORAGE_KEY,
        JSON.stringify({
          personaId: state.personaId,
          accountId: state.accountId,
          activePatientId: state.activePatientId,
          lastTab: state.lastTab,
        }),
      );
    } catch {
      // Storage unavailable: the context lives in memory for this run.
    }
  });

  return store;
}
