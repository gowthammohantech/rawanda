/**
 * CTZ-08 AC: high contrast passes the contrast check (≥ 7:1 body text) — the wallet theme's
 * token set for every text pair, chip tone and button label; the normal set stays AA.
 */
import {
  HIGH_CONTRAST_TEXT_PAIRS,
  HIGH_CONTRAST_TONE_COLORS,
  TONE_COLORS,
  colors,
  contrastRatio,
  paletteFor,
} from "@laif/ui-native";
import { describe, expect, it } from "vitest";

import {
  createDisplayStore,
  DEFAULT_DISPLAY_SETTINGS,
  DISPLAY_STORAGE_KEY,
} from "../displayStore.ts";

describe("high-contrast tokens", () => {
  const hc = paletteFor(true);

  it("body text (ink, muted, subtle) is ≥ 7:1 on every surface", () => {
    for (const fg of ["ink", "muted", "subtle"] as const) {
      for (const bg of ["surface", "background", "canvas"] as const) {
        expect(contrastRatio(hc[fg], hc[bg])).toBeGreaterThanOrEqual(7);
      }
    }
  });

  it.each(HIGH_CONTRAST_TEXT_PAIRS.map(([fg, bg]) => [fg, bg] as const))(
    "%s on %s ≥ 7:1",
    (fg, bg) => {
      expect(contrastRatio(hc[fg], hc[bg])).toBeGreaterThanOrEqual(7);
    },
  );

  it("status chips keep ≥ 7:1 in high contrast (and the normal tones stay AA)", () => {
    for (const tone of Object.values(HIGH_CONTRAST_TONE_COLORS)) {
      expect(contrastRatio(tone.fg, tone.bg)).toBeGreaterThanOrEqual(7);
    }
    for (const tone of Object.values(TONE_COLORS)) {
      expect(contrastRatio(tone.fg, tone.bg)).toBeGreaterThanOrEqual(4.5);
    }
  });

  it("the normal palette is returned when high contrast is off", () => {
    expect(paletteFor(false)).toBe(colors);
  });
});

describe("device display store", () => {
  it("persists text scale + high contrast and restores them (relaunch)", () => {
    const storage = window.localStorage;
    const first = createDisplayStore(storage);
    expect(first.getState()).toMatchObject(DEFAULT_DISPLAY_SETTINGS);
    first.getState().set({ textScale: 1.5, highContrast: true });
    expect(JSON.parse(storage.getItem(DISPLAY_STORAGE_KEY) ?? "{}")).toEqual({
      textScale: 1.5,
      highContrast: true,
    });
    expect(createDisplayStore(storage).getState()).toMatchObject({
      textScale: 1.5,
      highContrast: true,
    });
  });

  it("ignores unknown stored values", () => {
    window.localStorage.setItem(DISPLAY_STORAGE_KEY, JSON.stringify({ textScale: 7 }));
    expect(createDisplayStore(window.localStorage).getState()).toMatchObject(
      DEFAULT_DISPLAY_SETTINGS,
    );
  });
});
