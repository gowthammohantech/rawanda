import { renderHook } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

vi.mock("@expo-google-fonts/dm-sans/400Regular", () => ({ DMSans_400Regular: 1 }));
vi.mock("@expo-google-fonts/dm-sans/500Medium", () => ({ DMSans_500Medium: 2 }));
vi.mock("@expo-google-fonts/dm-sans/600SemiBold", () => ({ DMSans_600SemiBold: 3 }));
vi.mock("@expo-google-fonts/dm-sans/700Bold", () => ({ DMSans_700Bold: 4 }));
vi.mock("@expo-google-fonts/manrope/600SemiBold", () => ({ Manrope_600SemiBold: 5 }));
vi.mock("@expo-google-fonts/manrope/700Bold", () => ({ Manrope_700Bold: 6 }));
vi.mock("@expo-google-fonts/manrope/800ExtraBold", () => ({ Manrope_800ExtraBold: 7 }));
vi.mock("@expo-google-fonts/jetbrains-mono/400Regular", () => ({ JetBrainsMono_400Regular: 8 }));
vi.mock("@expo-google-fonts/jetbrains-mono/500Medium", () => ({ JetBrainsMono_500Medium: 9 }));
const useFonts = vi.fn<(map: Record<string, number>) => [boolean, Error | null]>(() => [
  true,
  null,
]);
vi.mock("expo-font", () => ({ useFonts: (map: Record<string, number>) => useFonts(map) }));

const { LAIF_FONT_ASSETS, useLaifFonts } = await import("./fonts.ts");
const { fontFamilies } = await import("./tokens.ts");

describe("useLaifFonts", () => {
  it("registers a bundled asset for every kit font family", () => {
    expect(Object.keys(LAIF_FONT_ASSETS).sort()).toEqual(Object.values(fontFamilies).sort());
  });

  it("loads the families through expo-font and reports loaded", () => {
    const { result } = renderHook(() => useLaifFonts());
    expect(useFonts).toHaveBeenCalledWith(LAIF_FONT_ASSETS);
    expect(result.current).toEqual({ loaded: true, error: null });
  });

  it("treats a load error as done (system font fallback)", () => {
    const error = new Error("boom");
    useFonts.mockReturnValueOnce([false, error]);
    const { result } = renderHook(() => useLaifFonts());
    expect(result.current).toEqual({ loaded: true, error });
  });
});
