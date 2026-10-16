/**
 * Self-hosted fonts (FND-10 task 4): DM Sans (body), Manrope (headings), JetBrains Mono
 * (micro-labels, chips) from the bundled `@expo-google-fonts/*` packages — no network fetch.
 *
 * Usage in an Expo app root (FND-11):
 *
 *   const fonts = useLaifFonts();
 *   if (!fonts.loaded) return <BrandSplash />;
 */
import { DMSans_400Regular } from "@expo-google-fonts/dm-sans/400Regular";
import { DMSans_500Medium } from "@expo-google-fonts/dm-sans/500Medium";
import { DMSans_600SemiBold } from "@expo-google-fonts/dm-sans/600SemiBold";
import { DMSans_700Bold } from "@expo-google-fonts/dm-sans/700Bold";
import { JetBrainsMono_400Regular } from "@expo-google-fonts/jetbrains-mono/400Regular";
import { JetBrainsMono_500Medium } from "@expo-google-fonts/jetbrains-mono/500Medium";
import { Manrope_600SemiBold } from "@expo-google-fonts/manrope/600SemiBold";
import { Manrope_700Bold } from "@expo-google-fonts/manrope/700Bold";
import { Manrope_800ExtraBold } from "@expo-google-fonts/manrope/800ExtraBold";
import { useFonts } from "expo-font";

import { fontFamilies, type FontFamilyToken } from "./tokens.ts";

/** Family name (as used in `fontFamily`) → bundled asset module. */
export const LAIF_FONT_ASSETS = {
  [fontFamilies.sans]: DMSans_400Regular,
  [fontFamilies.sansMedium]: DMSans_500Medium,
  [fontFamilies.sansSemiBold]: DMSans_600SemiBold,
  [fontFamilies.sansBold]: DMSans_700Bold,
  [fontFamilies.displaySemiBold]: Manrope_600SemiBold,
  [fontFamilies.display]: Manrope_700Bold,
  [fontFamilies.displayExtraBold]: Manrope_800ExtraBold,
  [fontFamilies.mono]: JetBrainsMono_400Regular,
  [fontFamilies.monoMedium]: JetBrainsMono_500Medium,
} as const satisfies Record<(typeof fontFamilies)[FontFamilyToken], number>;

export type LaifFontsState = { loaded: boolean; error: Error | null };

/** Loads every kit font through `expo-font`. `loaded` is also true after a load error (system fallback). */
export function useLaifFonts(): LaifFontsState {
  const [loaded, error] = useFonts(LAIF_FONT_ASSETS);
  return { loaded: loaded || error !== null, error };
}
