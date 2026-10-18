/**
 * CTZ-08 display preferences: the high-contrast token set reaches ≥ 7:1 for every text pair,
 * and `textScale` / `highContrast` reach `AppText`, `Button` and `StatusChip` (provider or prop),
 * with `allowFontScaling` still on (OS dynamic type composes with the app multiplier).
 */
import { renderNative } from "@laif/test-utils/native";
import { screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { AppText } from "./components/AppText.tsx";
import { Button } from "./components/Button.tsx";
import { StatusChip } from "./components/StatusChip.tsx";
import { TONE_COLORS } from "./components/tone.ts";
import { DisplayPrefsProvider, HIGH_CONTRAST_TONE_COLORS, toHighContrast } from "./theme.tsx";
import {
  colors,
  contrastRatio,
  highContrastColors,
  HIGH_CONTRAST_TEXT_PAIRS,
  TEXT_SCALES,
  typeScale,
} from "./tokens.ts";

function rgb(hex: string): string {
  const n = parseInt(hex.slice(1), 16);
  return `rgb(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255})`;
}

describe("high-contrast tokens (CTZ-08 AC 4)", () => {
  it("has exactly the normal colour token names", () => {
    expect(Object.keys(highContrastColors).sort()).toEqual(Object.keys(colors).sort());
  });

  it("matches the phase values for ink, surface, actions and borders", () => {
    expect(highContrastColors.ink).toBe("#000000");
    expect(highContrastColors.surface).toBe("#FFFFFF");
    expect(highContrastColors.primary).toBe("#075D66");
    expect(highContrastColors.border).toBe("#18252B");
  });

  it.each(HIGH_CONTRAST_TEXT_PAIRS.map(([fg, bg]) => [fg, bg] as const))(
    "%s on %s is at least 7:1",
    (fg, bg) => {
      expect(contrastRatio(highContrastColors[fg], highContrastColors[bg])).toBeGreaterThanOrEqual(
        7,
      );
    },
  );

  it("every high-contrast status tone keeps ≥ 7:1 text on its chip background", () => {
    for (const tone of Object.values(HIGH_CONTRAST_TONE_COLORS)) {
      expect(contrastRatio(tone.fg, tone.bg)).toBeGreaterThanOrEqual(7);
    }
  });

  it("contrastRatio matches known WCAG values", () => {
    expect(contrastRatio("#000000", "#FFFFFF")).toBeCloseTo(21, 5);
    expect(contrastRatio("#FFFFFF", "#FFFFFF")).toBeCloseTo(1, 5);
  });

  it("maps raw normal colours (tone fg) to their high-contrast counterpart", () => {
    expect(toHighContrast(colors.muted)).toBe(highContrastColors.muted);
    expect(toHighContrast(TONE_COLORS.warning.fg)).toBe(highContrastColors.warning);
    expect(toHighContrast("rgba(0, 0, 0, 0.2)")).toBe("rgba(0, 0, 0, 0.2)");
  });
});

describe("text scale + high contrast in kit primitives", () => {
  it("offers Standard / Large / Larger / Largest", () => {
    expect(TEXT_SCALES).toEqual([1, 1.15, 1.3, 1.5]);
  });

  it("AppText multiplies the token size by the provider scale and keeps font scaling on", () => {
    renderNative(
      <DisplayPrefsProvider value={{ textScale: 1.5, highContrast: false }}>
        <AppText testID="body">Hello</AppText>
      </DisplayPrefsProvider>,
    );
    const style = getComputedStyle(screen.getByTestId("body"));
    expect(parseFloat(style.fontSize)).toBeCloseTo(typeScale.body.fontSize * 1.5, 1);
    expect(style.color).toBe(rgb(colors.ink));
  });

  it("the textScale prop overrides the provider", () => {
    renderNative(
      <DisplayPrefsProvider value={{ textScale: 1.5, highContrast: false }}>
        <AppText testID="body" textScale={1}>
          Hello
        </AppText>
      </DisplayPrefsProvider>,
    );
    expect(parseFloat(getComputedStyle(screen.getByTestId("body")).fontSize)).toBeCloseTo(
      typeScale.body.fontSize,
      1,
    );
  });

  it("high contrast recolours AppText, Button and StatusChip", () => {
    renderNative(
      <DisplayPrefsProvider value={{ textScale: 1, highContrast: true }}>
        <AppText testID="muted" color="muted">
          Muted
        </AppText>
        <Button testID="primary">Save</Button>
        <StatusChip tone="positive" testID="chip">
          Reviewed
        </StatusChip>
      </DisplayPrefsProvider>,
    );
    expect(getComputedStyle(screen.getByTestId("muted")).color).toBe(rgb(highContrastColors.muted));
    expect(getComputedStyle(screen.getByTestId("primary")).backgroundColor).toBe(
      rgb(highContrastColors.primary),
    );
    const chip = screen.getByTestId("chip");
    expect(getComputedStyle(chip).backgroundColor).toBe(rgb(highContrastColors.surface));
    // Status keeps icon + text in high contrast.
    expect(chip.textContent).toBe("Reviewed");
    expect(screen.getByTestId("icon-check")).toBeTruthy();
  });

  it("Button and StatusChip accept a textScale prop", () => {
    renderNative(
      <>
        <Button textScale={1.3}>Save</Button>
        <StatusChip textScale={1.3}>Waiting</StatusChip>
      </>,
    );
    const label = screen.getByText("Save");
    expect(parseFloat(getComputedStyle(label).fontSize)).toBeCloseTo(
      typeScale.body.fontSize * 1.3,
      1,
    );
    const chipText = screen.getByText("Waiting");
    expect(parseFloat(getComputedStyle(chipText).fontSize)).toBeCloseTo(
      typeScale.micro.fontSize * 1.3,
      1,
    );
  });
});
