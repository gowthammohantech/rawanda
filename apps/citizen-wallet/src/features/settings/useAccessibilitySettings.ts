/**
 * Accessibility settings state (CTZ-08 tasks 1–4). A change applies on this phone AT ONCE (live
 * preview, works offline and before a persona is chosen): the language through the FND-04
 * preference store (`laif.citizen.language`), text scale / high contrast through the device
 * display store (`laif.citizen.display`). With a signed-in persona it is then saved to
 * `ctz_settings` via `repo.updateSettings(patch, expectedVersion, key)` (→
 * `citizen.settings.changed`):
 * - server error / timeout → the device change is reverted, inline error + Retry (SAME key);
 * - `CONFLICT` (changed elsewhere) → the saved values are reloaded and applied, toast;
 * - `OFFLINE` (demo offline toggle) → the device keeps the change (it is a phone preference).
 */
import type { CitizenSettings } from "@laif/contracts";
import { useLanguage, type Language } from "@laif/i18n";
import { RepositoryError } from "@laif/repositories";
import { useToast, type TextScale } from "@laif/ui-native";
import { useCallback, useRef, useState } from "react";

import { newIdempotencyKey } from "../../data/keys.ts";
import { useCitizenSettings, useUpdateCitizenSettings } from "../../data/queries.ts";
import { usePersona } from "../../providers.tsx";
import { isTextScale } from "../../theme/displayStore.ts";
import { useDisplay, useDisplayStore } from "../../theme/ThemeProvider.tsx";

export type SettingsPatch = Partial<{
  language: Language;
  textScale: TextScale;
  highContrast: boolean;
}>;

export type SettingsValues = { language: Language; textScale: TextScale; highContrast: boolean };

export type SaveStatus = "idle" | "saving" | "error";

type Pending = { patch: SettingsPatch; key: string; previous: SettingsValues };

export function useAccessibilitySettings() {
  const { toast } = useToast();
  const persona = usePersona();
  const signedIn = persona !== null;
  const settings = useCitizenSettings();
  const mutation = useUpdateCitizenSettings();
  const display = useDisplayStore();
  const textScale = useDisplay((s) => s.textScale);
  const highContrast = useDisplay((s) => s.highContrast);
  const { language, setLanguage } = useLanguage();
  const [status, setStatus] = useState<SaveStatus>("idle");
  const pending = useRef<Pending | null>(null);
  const version = useRef<number | null>(null);

  const values: SettingsValues = { language, textScale, highContrast };

  const apply = useCallback(
    async (patch: SettingsPatch) => {
      const { language: nextLanguage, ...rest } = patch;
      if (rest.textScale !== undefined || rest.highContrast !== undefined) {
        display.getState().set(rest);
      }
      if (nextLanguage !== undefined) await setLanguage(nextLanguage);
    },
    [display, setLanguage],
  );

  const applySaved = useCallback(
    async (saved: CitizenSettings | null | undefined) => {
      if (saved == null) return;
      version.current = saved.version;
      await apply({
        language: saved.language,
        highContrast: saved.highContrast,
        ...(isTextScale(saved.textScale) ? { textScale: saved.textScale } : {}),
      });
    },
    [apply],
  );

  const saveToProfile = useCallback(
    async ({ patch, key, previous }: Pending) => {
      setStatus("saving");
      const known = Math.max(version.current ?? 0, settings.data?.version ?? 0);
      try {
        const result = await mutation.mutateAsync({
          input: { ...patch, ...(known > 0 ? { expectedVersion: known } : {}) },
          key,
        });
        version.current = result.data.version;
        pending.current = null;
        setStatus("idle");
        toast({ title: (tx) => tx("citizen:accessibility.saved"), tone: "positive" });
      } catch (error) {
        if (error instanceof RepositoryError && error.code === "CONFLICT") {
          pending.current = null;
          const reloaded = await settings.refetch();
          await applySaved(reloaded.data);
          setStatus("idle");
          toast({ title: (tx) => tx("citizen:accessibility.conflict"), tone: "warning" });
        } else if (error instanceof RepositoryError && error.code === "OFFLINE") {
          pending.current = null;
          setStatus("idle");
          toast({ title: (tx) => tx("citizen:accessibility.saved"), tone: "positive" });
        } else {
          // Revert on this phone; Retry replays the same request with the same key (T-09).
          await apply(previous);
          setStatus("error");
        }
      }
    },
    [mutation, settings, applySaved, apply, toast],
  );

  const change = useCallback(
    async (patch: SettingsPatch) => {
      if (status === "saving") return;
      const previous: SettingsValues = { language, textScale, highContrast };
      await apply(patch);
      if (!signedIn) {
        toast({ title: (tx) => tx("citizen:accessibility.saved"), tone: "positive" });
        return;
      }
      const next: Pending = { patch, key: newIdempotencyKey(), previous };
      pending.current = next;
      await saveToProfile(next);
    },
    [status, language, textScale, highContrast, apply, signedIn, saveToProfile, toast],
  );

  const retry = useCallback(async () => {
    const last = pending.current;
    if (last === null) return;
    await apply(last.patch);
    await saveToProfile(last);
  }, [apply, saveToProfile]);

  return {
    values,
    signedIn,
    loading: signedIn && settings.isPending,
    status,
    change,
    retry,
  };
}
