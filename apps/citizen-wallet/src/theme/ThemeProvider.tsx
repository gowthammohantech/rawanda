/**
 * Wallet theme (CTZ-08): composes the `@laif/ui-native` tokens with the device display
 * preferences — the high-contrast token set and the app-level text scale (on top of OS dynamic
 * type). Mounted in `AppProviders`, so every kit text / button / chip / card follows at once.
 * `useScaledFont()` scales custom 1× sizes (icons, previews) by the same multiplier.
 */
import { DisplayPrefsProvider, useScaledFont } from "@laif/ui-native";
import { createContext, useContext, type ReactNode } from "react";
import { useStore } from "zustand";

import type { DisplayState, DisplayStore } from "./displayStore.ts";

export { useScaledFont };

const DisplayStoreContext = createContext<DisplayStore | null>(null);

export function ThemeProvider({ store, children }: { store: DisplayStore; children?: ReactNode }) {
  const textScale = useStore(store, (s) => s.textScale);
  const highContrast = useStore(store, (s) => s.highContrast);
  return (
    <DisplayStoreContext.Provider value={store}>
      <DisplayPrefsProvider value={{ textScale, highContrast }}>{children}</DisplayPrefsProvider>
    </DisplayStoreContext.Provider>
  );
}

export function useDisplayStore(): DisplayStore {
  const store = useContext(DisplayStoreContext);
  if (store === null) throw new Error("useDisplayStore must be used inside <ThemeProvider>");
  return store;
}

/** Selects from the device display preferences (re-renders on change). */
export function useDisplay<T>(selector: (state: DisplayState) => T): T {
  return useStore(useDisplayStore(), selector);
}
