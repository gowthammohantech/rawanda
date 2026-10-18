/**
 * Display preferences (CTZ-08): an app-level text-size multiplier and the high-contrast token
 * set, provided once at the app root and read by the kit's text and colour primitives
 * (`AppText`, `Button`, `StatusChip`, `Screen`, `Card`). Without a provider everything renders
 * at the defaults (scale 1, normal palette), so other apps are unaffected.
 *
 * The multiplier composes with OS dynamic type: `allowFontScaling` stays on, so the rendered
 * size is `token size × textScale × OS font scale`.
 */
import { createContext, useContext, useMemo, type ReactNode } from "react";

import { TONE_COLORS, type Tone, type ToneColors } from "./components/tone.ts";
import {
  colors,
  highContrastColors,
  typeScale,
  type ColorToken,
  type TypeVariant,
} from "./tokens.ts";

export type DisplayPrefs = {
  /** App-level text size multiplier (1 = OS size only). */
  textScale: number;
  highContrast: boolean;
};

export const DEFAULT_DISPLAY_PREFS: Readonly<DisplayPrefs> = Object.freeze({
  textScale: 1,
  highContrast: false,
});

export type Palette = Readonly<Record<ColorToken, string>>;

const DisplayPrefsContext = createContext<DisplayPrefs>(DEFAULT_DISPLAY_PREFS);

export function DisplayPrefsProvider({
  value,
  children,
}: {
  value: DisplayPrefs;
  children?: ReactNode;
}) {
  const memo = useMemo(
    () => ({ textScale: value.textScale, highContrast: value.highContrast }),
    [value.textScale, value.highContrast],
  );
  return <DisplayPrefsContext.Provider value={memo}>{children}</DisplayPrefsContext.Provider>;
}

export function useDisplayPrefs(): DisplayPrefs {
  return useContext(DisplayPrefsContext);
}

/** The colour set for the current preferences (same token names either way). */
export function paletteFor(highContrast: boolean): Palette {
  return highContrast ? highContrastColors : colors;
}

export function usePalette(): Palette {
  return paletteFor(useDisplayPrefs().highContrast);
}

/** High-contrast chip/callout tones: strong foreground on white with a foreground border. */
export const HIGH_CONTRAST_TONE_COLORS: Record<Tone, ToneColors> = {
  neutral: {
    fg: highContrastColors.ink,
    bg: highContrastColors.surface,
    border: highContrastColors.border,
  },
  info: {
    fg: highContrastColors.info,
    bg: highContrastColors.surface,
    border: highContrastColors.info,
  },
  positive: {
    fg: highContrastColors.positive,
    bg: highContrastColors.surface,
    border: highContrastColors.positive,
  },
  warning: {
    fg: highContrastColors.warning,
    bg: highContrastColors.surface,
    border: highContrastColors.warning,
  },
  danger: {
    fg: highContrastColors.danger,
    bg: highContrastColors.surface,
    border: highContrastColors.danger,
  },
};

export function useToneColors(): Record<Tone, ToneColors> {
  return useDisplayPrefs().highContrast ? HIGH_CONTRAST_TONE_COLORS : TONE_COLORS;
}

const NORMAL_HEX_TO_TOKEN: ReadonlyMap<string, ColorToken> = new Map(
  (Object.keys(colors) as ColorToken[]).map((token) => [colors[token].toLowerCase(), token]),
);

/**
 * Maps a raw normal-palette colour (e.g. a tone `fg` passed as `colorValue`) to its
 * high-contrast counterpart; unknown values (rgba tints) are returned unchanged.
 */
export function toHighContrast(value: string): string {
  const token = NORMAL_HEX_TO_TOKEN.get(value.toLowerCase());
  return token === undefined ? value : highContrastColors[token];
}

/** Resolves a colour for the current preferences. */
export function resolveColor(highContrast: boolean, token: ColorToken, raw?: string): string {
  if (raw !== undefined) return highContrast ? toHighContrast(raw) : raw;
  return paletteFor(highContrast)[token];
}

/** Type-scale step multiplied by the app-level text scale (OS dynamic type still applies). */
export function scaledType(variant: TypeVariant, textScale: number) {
  const step = typeScale[variant];
  return {
    fontSize: Math.round(step.fontSize * textScale * 10) / 10,
    lineHeight: Math.round(step.lineHeight * textScale * 10) / 10,
    letterSpacing: step.letterSpacing,
  };
}

/** `useScaledFont()` — scale a 1× size (icons, custom text) by the app-level multiplier. */
export function useScaledFont() {
  const { textScale } = useDisplayPrefs();
  return useMemo(
    () => ({
      textScale,
      scale: (size: number) => Math.round(size * textScale * 10) / 10,
      type: (variant: TypeVariant) => scaledType(variant, textScale),
    }),
    [textScale],
  );
}
