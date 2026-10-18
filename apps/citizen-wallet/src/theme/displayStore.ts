/**
 * Device display preferences (CTZ-08): text scale + high contrast, persisted under
 * `laif.citizen.display` in the same synchronous key/value storage as the persona session
 * (`expo-sqlite/kv-store` on device, localStorage on the web target). Like the language
 * (`laif.citizen.language`, FND-04) they apply BEFORE a persona is chosen and fully offline;
 * a signed-in persona's choices are also saved to `ctz_settings` (audited) by the
 * Accessibility screen. Never stores health data.
 */
import type { KeyValueStorage } from "@laif/auth-demo";
import { TEXT_SCALES, type TextScale } from "@laif/ui-native";
import { createStore, type StoreApi } from "zustand/vanilla";

export const DISPLAY_STORAGE_KEY = "laif.citizen.display" as const;

export type DisplaySettings = { textScale: TextScale; highContrast: boolean };

export const DEFAULT_DISPLAY_SETTINGS: Readonly<DisplaySettings> = Object.freeze({
  textScale: 1,
  highContrast: false,
});

export type DisplayState = DisplaySettings & {
  set: (patch: Partial<DisplaySettings>) => void;
  /** Baseline (Reset demo). */
  reset: () => void;
};

export type DisplayStore = StoreApi<DisplayState>;

export function isTextScale(value: unknown): value is TextScale {
  return typeof value === "number" && (TEXT_SCALES as readonly number[]).includes(value);
}

function read(storage: KeyValueStorage): DisplaySettings {
  try {
    const raw = storage.getItem(DISPLAY_STORAGE_KEY);
    if (raw === null) return { ...DEFAULT_DISPLAY_SETTINGS };
    const value = JSON.parse(raw) as Partial<Record<keyof DisplaySettings, unknown>>;
    return {
      textScale: isTextScale(value.textScale) ? value.textScale : 1,
      highContrast: value.highContrast === true,
    };
  } catch {
    return { ...DEFAULT_DISPLAY_SETTINGS };
  }
}

export function createDisplayStore(storage: KeyValueStorage): DisplayStore {
  const store = createStore<DisplayState>()((setState) => ({
    ...read(storage),
    set: (patch) => setState(patch),
    reset: () => setState({ ...DEFAULT_DISPLAY_SETTINGS }),
  }));
  store.subscribe((state) => {
    try {
      storage.setItem(
        DISPLAY_STORAGE_KEY,
        JSON.stringify({ textScale: state.textScale, highContrast: state.highContrast }),
      );
    } catch {
      // Storage unavailable: the preference lives in memory for this run.
    }
  });
  return store;
}
