/**
 * CTZ-09 polish: component styles built from the CURRENT palette (normal or high contrast), so
 * high contrast reaches every icon, border and background — not only kit components. The
 * factory runs once per palette (both palettes are constant objects).
 */
import { usePalette, type Palette } from "@laif/ui-native";
import { useMemo } from "react";

export function useThemedStyles<T>(factory: (palette: Palette) => T): T {
  const palette = usePalette();
  return useMemo(() => factory(palette), [factory, palette]);
}
