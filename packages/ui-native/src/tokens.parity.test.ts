import * as web from "@laif/ui-web/tokens";
import { describe, expect, it } from "vitest";

import {
  colors,
  minTouchTarget,
  radii,
  semanticColor,
  semanticColors,
  typeScale,
} from "./tokens.ts";

describe("tokens parity with @laif/ui-web (FND-10 AC 1)", () => {
  it("has exactly the same colour token names", () => {
    expect(Object.keys(colors).sort()).toEqual(Object.keys(web.colors).sort());
  });

  it.each(Object.keys(web.colors) as (keyof typeof web.colors)[])(
    "colour %s equals ui-web",
    (name) => {
      expect(colors[name]).toBe(web.colors[name]);
    },
  );

  it("has the same semantic aliases resolving to the same values", () => {
    expect(semanticColors).toEqual(web.semanticColors);
    for (const token of Object.keys(web.semanticColors) as (keyof typeof web.semanticColors)[]) {
      expect(semanticColor(token)).toBe(web.semanticColor(token));
    }
  });

  it("uses the same radii and the touch target of the web touch breakpoint", () => {
    expect(radii).toEqual(web.radii);
    expect(minTouchTarget).toBe(web.minTarget.touch);
    expect(minTouchTarget).toBeGreaterThanOrEqual(44);
  });

  it("text pairs used by native chips keep WCAG AA contrast", () => {
    for (const [fg, bg] of web.TEXT_CONTRAST_PAIRS) {
      expect(web.contrastRatio(colors[fg], colors[bg])).toBeGreaterThanOrEqual(4.5);
    }
  });

  it("has the phase type scale (caption 12, body 15, bodyLarge 17, title 20, display 26)", () => {
    expect(
      [
        typeScale.caption,
        typeScale.body,
        typeScale.bodyLarge,
        typeScale.title,
        typeScale.display,
      ].map((s) => s.fontSize),
    ).toEqual([12, 15, 17, 20, 26]);
  });
});
